'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function harness({initialStatus = 'waiting', notificationThrows = false, resumeFails = false} = {}) {
  const elements = new Map(), events = new Map(), intervals = new Map();
  let nextTimer = 1, contexts = 0, notes = 0;
  const classList = () => {
    const values = new Set();
    return {add: x => values.add(x), remove: x => values.delete(x),
      contains: x => values.has(x), toggle: (x, enabled) => enabled ? values.add(x) : values.delete(x)};
  };
  const element = id => {
    if (!elements.has(id)) elements.set(id, {textContent: '', classList: classList(), disabled: false});
    return elements.get(id);
  };
  const fixture = {ticket: {id: 1, status: initialStatus, venue: 'Test', number: 1,
    name: 'Fixture', ahead: 4, notify_ahead: 2, waiting_total: 5, est_minutes: 10}, fail: false};
  class Audio {
    constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { if (resumeFails) throw Error('blocked'); this.state = 'running'; this.onstatechange?.(); }
    createOscillator() { return {connect() {}, frequency: {}, start() { notes++; }, stop() {}}; }
    createGain() { return {connect() {}, gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}}; }
  }
  function Notice() { if (notificationThrows) throw new TypeError('Use ServiceWorkerRegistration'); }
  Notice.permission = 'granted'; Notice.requestPermission = async () => 'granted';
  const document = {hidden: false, body: {classList: classList()}, getElementById: element,
    addEventListener: (name, fn) => events.set('document:' + name, fn)};
  const context = {document, navigator: {vibrate() { return true; }}, AudioContext: Audio,
    Notification: Notice, URLSearchParams, location: {pathname: '/b/demo/ticket', search: '?id=1', replace() {}},
    localStorage: {removeItem() {}}, applyI18n() {}, renderLangPicker() {}, t: key => key, setLang() {},
    setInterval: (fn, ms) => { const id = nextTimer++; intervals.set(id, {fn, ms}); return id; },
    clearInterval: id => intervals.delete(id), setTimeout: () => nextTimer++,
    addEventListener: (name, fn) => events.set('window:' + name, fn),
    fetch: async path => {
      if (String(path).endsWith('/settings')) return {ok: true, json: async () => ({has_logo: false})};
      if (fixture.fail) throw Error('offline');
      return {ok: true, json: async () => ({ticket: {...fixture.ticket}})};
    }};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(process.env.TICKET_TEST_SCRIPT || 'public/ticket.js', 'utf8'), context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  const read = code => vm.runInContext(code, context);
  return {context, fixture, element, intervals, document, events, read,
    counts: () => ({contexts, notes}),
    ready: async () => { fixture.ticket.status = 'ready'; await context.poll(); },
    visible: async visible => { document.hidden = !visible; events.get('document:visibilitychange')(); await flush(); },
    ack: () => events.get('window:pointerdown')(),
    state: () => read('({status:currentTicket?.status, shown:readyShown, acknowledged:readyAcknowledged, beeping:beepTimer!==null})')};
}

test('Ready on first page load gets a visible alert without waiting-to-ready transition', async () => {
  const h = await harness({initialStatus: 'ready'});
  assert.equal(h.state().shown, true);
  assert.equal(h.document.body.classList.contains('flash-ready'), true);
  assert.equal(h.element('wrap').classList.contains('is-ready'), true);
  assert.equal(h.counts().contexts, 0, 'polling must not create unactivated audio contexts');
});
test('A user sound action unlocks one reusable context and ready starts a repeating tone', async () => {
  const h = await harness();
  await h.context.enableSound(); await h.context.enableSound();
  assert.equal(h.counts().contexts, 1);
  await h.ready();
  assert.equal(h.state().beeping, true);
  assert.equal([...h.intervals.values()].some(t => t.ms === 1600), true);
  assert.equal(h.counts().notes, 8);
  const before = h.counts().notes; await h.context.poll();
  assert.equal(h.counts().notes, before, 'ordinary polls must not duplicate the ready alert');
});
test('Ready received while hidden is offered when the page returns', async () => {
  const h = await harness(); await h.context.enableSound(false);
  await h.visible(false); await h.ready();
  assert.equal(h.state().shown, false); assert.equal(h.state().beeping, false);
  await h.visible(true);
  assert.equal(h.state().shown, true); assert.equal(h.state().beeping, true);
});
test('Unacknowledged foreground alert resumes after a background round trip', async () => {
  const h = await harness(); await h.context.enableSound(false); await h.ready();
  await h.visible(false); assert.equal(h.state().beeping, false);
  await h.visible(true); assert.equal(h.state().beeping, true);
  h.ack(); assert.equal(h.state().beeping, false);
  await h.visible(false); await h.visible(true);
  assert.equal(h.state().beeping, false, 'acknowledged alert must stay quiet');
});
test('Unsupported mobile Notification constructor cannot break ready rendering or sound', async () => {
  const h = await harness({notificationThrows: true});
  await h.context.enableSound(false); await h.ready();
  assert.equal(h.state().status, 'ready'); assert.equal(h.state().beeping, true);
  assert.equal(h.element('notifyBtn').disabled, true);
  assert.equal(h.element('ticketStatus').textContent, 'status_ready');
});
test('Done or cancelled stops an existing ready alarm', async () => {
  for (const status of ['done', 'cancelled']) {
    const h = await harness(); await h.context.enableSound(false); await h.ready();
    h.fixture.ticket.status = status; await h.context.poll();
    assert.equal(h.state().beeping, false);
    assert.equal(h.document.body.classList.contains('flash-ready'), false);
  }
});
test('Blocked sound and lost connection are shown instead of silently claiming success', async () => {
  const h = await harness({resumeFails: true});
  assert.equal(await h.context.enableSound(), false);
  assert.equal(h.element('soundState').textContent, 'sound_blocked');
  h.fixture.fail = true; await h.context.poll();
  assert.equal(h.element('connectionHint').textContent, 'connection_lost');
});
