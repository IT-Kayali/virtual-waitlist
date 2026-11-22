'use strict';

const SLUG = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];
if (!SLUG) location.replace('/');
const TKEY = 'ql_ticket_' + SLUG;
const BASE = '/api/b/' + encodeURIComponent(SLUG);

const ticketId = new URLSearchParams(location.search).get('id');
if (!ticketId) location.replace('/b/' + SLUG);

applyI18n();
renderLangPicker('langPicker');

const $ = (id) => document.getElementById(id);
let lastStatus = null;
let notified = false;
let almostNotified = false;
$('privacyLink').href = '/b/' + SLUG + '/privacy';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

// Akustisches Signal: laute, wiederholte Melodie (WebAudio, kein externes Asset)
let beepTimer = null;
function beepOnce() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1108, 1318, 1760].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
  } catch { /* stumm */ }
}
function startBeeping() {
  beepOnce();
  if (!beepTimer) beepTimer = setInterval(beepOnce, 1600); // wiederholt, bis der Nutzer tippt
}
function stopBeeping() {
  if (beepTimer) { clearInterval(beepTimer); beepTimer = null; }
}
window.addEventListener('pointerdown', stopBeeping);
window.addEventListener('keydown', stopBeeping);

// Dezenteres Signal fuer "fast dran"
function beepAlmost() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [988, 1318].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.18);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.2);
    });
  } catch { /* stumm */ }
}

function alertAlmost(ticket) {
  if (almostNotified) return;
  almostNotified = true;
  beepAlmost();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(ticket.venue, { body: t('status_almost') });
  }
}

function alertReady(ticket) {
  if (notified) return;
  notified = true;
  startBeeping();
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400, 150, 800]);
  document.body.classList.add('flash-ready');
  setTimeout(() => document.body.classList.remove('flash-ready'), 1200);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(ticket.venue, { body: t('status_ready'), requireInteraction: true });
  }
}

function render(ticket) {
  $('venueName').textContent = ticket.venue;
  $('ticketNumber').textContent = ticket.number;
  const wrap = $('wrap');
  wrap.classList.toggle('is-ready', ticket.status === 'ready');

  if (ticket.status === 'waiting') {
    const almost = ticket.ahead > 0 && ticket.ahead <= (ticket.notify_ahead ?? 2);
    $('ticketStatus').textContent = almost ? t('status_almost') : t('status_waiting');
    $('ticketStatus').classList.add('pulse');
    $('ticketSub').textContent = ticket.name || '';
    $('statsRow').classList.remove('hidden');
    $('aheadNum').textContent = ticket.ahead;
    $('totalNum').textContent = ticket.waiting_total;
    $('estNum').textContent = ticket.est_minutes;
    if (almost) alertAlmost(ticket);
  } else if (ticket.status === 'ready') {
    $('ticketStatus').textContent = t('status_ready');
    $('ticketStatus').classList.remove('pulse');
    $('ticketSub').textContent = t('status_ready_sub');
    $('statsRow').classList.add('hidden');
  } else if (ticket.status === 'done') {
    $('ticketStatus').textContent = t('status_done');
    $('ticketStatus').classList.remove('pulse');
    $('ticketSub').textContent = '';
    $('statsRow').classList.add('hidden');
    $('leaveBtn').classList.add('hidden');
  } else {
    $('ticketStatus').textContent = t('status_cancelled');
    $('ticketSub').textContent = '';
    $('statsRow').classList.add('hidden');
    $('leaveBtn').classList.add('hidden');
  }

  if (ticket.status === 'ready' && lastStatus === 'waiting') alertReady(ticket);
  lastStatus = ticket.status;
}

async function poll() {
  try {
    const data = await api(BASE + '/ticket/' + ticketId);
    render(data.ticket);
    if (['done', 'cancelled'].includes(data.ticket.status)) {
      localStorage.removeItem(TKEY);
    }
  } catch {
    // Ticket weg oder Server kurz nicht da – beim nächsten Poll erneut versuchen
  }
}

$('notifyBtn').onclick = async () => {
  if (!('Notification' in window)) { $('notifyBtn').textContent = 'Not supported'; return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') $('notifyBtn').textContent = t('notify_on');
};

$('leaveBtn').onclick = async () => {
  try { await api(`${BASE}/ticket/${ticketId}/cancel`, { method: 'POST' }); } catch { /* egal */ }
  localStorage.removeItem(TKEY);
  location.href = '/b/' + SLUG;
};

// Sprache wechseln → Inhalte neu zeichnen
const origSetLang = setLang;
setLang = (lang) => { origSetLang(lang); lastStatus = null; poll(); };

poll();
setInterval(poll, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

// Logo einmalig laden (404 -> ausgeblendet lassen)
api(BASE + '/settings').then((d) => {
  if (d.has_logo) {
    const logo = $('venueLogo');
    logo.src = BASE + '/logo';
    logo.classList.remove('hidden');
  }
}).catch(() => {});
