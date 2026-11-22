'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const webpush = require('web-push');

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
function validateSubscription(value) {
  const fail = () => { throw new Error('Ungueltiges oder nicht unterstuetztes Push-Abonnement.'); };
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 4096) return fail();
  let url;
  try { url = new URL(value.endpoint); } catch { return fail(); }
  // No caller-selected hosts, local addresses, credentials, ports or redirects.
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    /^(?:[a-z0-9-]+\.)?push\.apple\.com$/.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') return fail();
  const keys = value.keys;
  if (!keys || !/^[A-Za-z0-9_-]{86,88}$/.test(keys.p256dh || '') || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth || '')) return fail();
  const point = Buffer.from(keys.p256dh, 'base64url');
  if (point.length !== 65 || point[0] !== 4 || Buffer.from(keys.auth, 'base64url').length !== 16) return fail();
  try { crypto.ECDH.convertKey(point, 'prime256v1'); } catch { return fail(); }
  return { endpoint: url.href, keys: {p256dh: keys.p256dh, auth: keys.auth} };
}

module.exports = function pushStore({db, configDir, subject, now = Date.now, deliver = webpush.sendNotification}) {
  const identityFile = path.join(configDir, '.push-identity.json');
  if (!fs.existsSync(identityFile)) {
    const identity = {...webpush.generateVAPIDKeys(), encryptionKey: crypto.randomBytes(32).toString('base64')};
    fs.writeFileSync(identityFile, JSON.stringify(identity), {flag: 'wx', mode: 0o600});
  }
  fs.chmodSync(identityFile, 0o600);
  const identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
  const key = Buffer.from(identity.encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('Push-Schluesseldatei beschaedigt.');
  if (!db.prepare("SELECT 1 FROM pragma_table_info('entries') WHERE name='guest_token_hash'").get()) {
    // A local volume backup precedes the additive migration. It is never served.
    const backup = path.join(configDir,'.pre-push-migration.sqlite');
    if (db.prepare('SELECT COUNT(*) AS n FROM entries').get().n && !fs.existsSync(backup)) {
      db.prepare('VACUUM INTO ?').run(backup);fs.chmodSync(backup,0o600);
    }
    db.exec('ALTER TABLE entries ADD COLUMN guest_token_hash TEXT');
  }
  if (!db.prepare("SELECT 1 FROM pragma_table_info('entries') WHERE name='ready_version'").get()) db.exec('ALTER TABLE entries ADD COLUMN ready_version INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare("SELECT 1 FROM pragma_table_info('entries') WHERE name='ready_ack_version'").get()) db.exec('ALTER TABLE entries ADD COLUMN ready_ack_version INTEGER NOT NULL DEFAULT -1');
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL, business_id INTEGER NOT NULL,
      endpoint_hash TEXT NOT NULL, encrypted TEXT NOT NULL, lang TEXT NOT NULL,
      expires_at INTEGER NOT NULL, last_sent_version INTEGER NOT NULL DEFAULT -1, UNIQUE(entry_id, endpoint_hash)
    );
    CREATE TABLE IF NOT EXISTS push_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER NOT NULL,
      entry_id INTEGER NOT NULL, business_id INTEGER NOT NULL, ready_version INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      UNIQUE(subscription_id, ready_version)
    );
    CREATE INDEX IF NOT EXISTS push_due_idx ON push_outbox(status, next_attempt);
    CREATE INDEX IF NOT EXISTS push_ticket_idx ON push_subscriptions(entry_id, business_id);
    CREATE TABLE IF NOT EXISTS push_vapid_cache (origin TEXT PRIMARY KEY, encrypted TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM pragma_table_info('push_outbox') WHERE name='reminder_index'").get()) db.exec('ALTER TABLE push_outbox ADD COLUMN reminder_index INTEGER NOT NULL DEFAULT 0');
  function capability(purpose,...parts) { return crypto.createHmac('sha256',key).update(JSON.stringify(['queueup-cap-v1',purpose,...parts])).digest('hex'); }
  function validAck(entry,version,token) {
    if (!entry || !Number.isSafeInteger(version) || version!==entry.ready_version || !validToken(token)) return false;
    return crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(capability('ack',entry.business_id,entry.id,version),'hex'));
  }
  function acknowledge(entry,version) {
    if (entry.status!=='ready' || version!==entry.ready_version) return;
    db.prepare('UPDATE entries SET ready_ack_version=? WHERE id=? AND ready_version=?').run(version,entry.id,version);
    db.prepare('DELETE FROM push_outbox WHERE entry_id=? AND ready_version=?').run(entry.id,version);
  }
  function seal(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('queueup-push-v1'));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
  }
  function open(value) {
    const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('queueup-push-v1')); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  }
  function removeSubscription(id) {
    db.prepare('DELETE FROM push_outbox WHERE subscription_id=?').run(id);
    db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(id);
  }
  function removeTicket(id) {
    db.prepare('DELETE FROM push_outbox WHERE entry_id=?').run(id);
    db.prepare('DELETE FROM push_subscriptions WHERE entry_id=?').run(id);
  }
  function cleanup() {
    for(const name of ['.pre-push-migration.sqlite','.pre-counter-migration.sqlite']) {
      const backup=path.join(configDir,name);
      if(fs.existsSync(backup)&&now()-fs.statSync(backup).mtimeMs>48*3600000)fs.unlinkSync(backup);
    }
    const rows = db.prepare(`SELECT s.id FROM push_subscriptions s LEFT JOIN entries e ON e.id=s.entry_id
      LEFT JOIN businesses b ON b.id=s.business_id WHERE s.expires_at<=? OR e.id IS NULL
      OR e.status NOT IN ('waiting','ready') OR b.active!=1 OR b.id IS NULL`).all(now());
    for (const row of rows) removeSubscription(row.id);
    db.prepare('DELETE FROM push_outbox WHERE expires_at<=?').run(now());
    db.prepare('DELETE FROM push_vapid_cache WHERE created_at<?').run(now()-12*3600000);
  }
  function authorized(entry, token) {
    if (!entry?.guest_token_hash || !validToken(token)) return false;
    return crypto.timingSafeEqual(Buffer.from(entry.guest_token_hash, 'hex'), Buffer.from(hash(token), 'hex'));
  }
  function enqueue(entry, onlySubscription) {
    if (entry.status !== 'ready' || entry.ready_ack_version>=entry.ready_version) return;
    const subscriptions = db.prepare('SELECT id,last_sent_version FROM push_subscriptions WHERE entry_id=? AND business_id=? AND expires_at>?').all(entry.id, entry.business_id, now());
    const insert = db.prepare('INSERT OR IGNORE INTO push_outbox(subscription_id,entry_id,business_id,ready_version,next_attempt,expires_at) VALUES (?,?,?,?,?,?)');
    for (const s of subscriptions) if ((!onlySubscription || onlySubscription === s.id) && s.last_sent_version < entry.ready_version) {
      insert.run(s.id, entry.id, entry.business_id, entry.ready_version, now(), now()+5*60000);
    }
  }
  function onStatus(entry) {
    if (entry.status === 'ready') enqueue(entry);
    else if (['done','cancelled'].includes(entry.status)) removeTicket(entry.id);
    else db.prepare("DELETE FROM push_outbox WHERE entry_id=? AND status='queued'").run(entry.id);
  }
  function subscribe(entry, subscription, lang) {
    cleanup();
    const safe = validateSubscription(subscription), endpointHash = hash(safe.endpoint);
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE entry_id=? AND endpoint_hash=?').get(entry.id, endpointHash);
    if (!existing && db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE entry_id=?').get(entry.id).n >= 3) throw new Error('Maximal drei Push-Geraete pro Ticket.');
    const expires = Date.parse(entry.created_at.replace(' ', 'T')+'Z')+48*3600000;
    if (!Number.isFinite(expires) || expires <= now() || !['waiting','ready'].includes(entry.status)) throw new Error('Dieses Ticket ist nicht mehr aktiv.');
    db.prepare(`INSERT INTO push_subscriptions(entry_id,business_id,endpoint_hash,encrypted,lang,expires_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(entry_id,endpoint_hash) DO UPDATE SET encrypted=excluded.encrypted,lang=excluded.lang`).run(entry.id, entry.business_id, endpointHash, seal(safe), ['en','de','ar'].includes(lang)?lang:'en', expires);
    const row = db.prepare('SELECT id FROM push_subscriptions WHERE entry_id=? AND endpoint_hash=?').get(entry.id, endpointHash);
    enqueue(entry, row.id);
  }
  function unsubscribe(entry, endpoint) {
    const row = db.prepare('SELECT id FROM push_subscriptions WHERE entry_id=? AND business_id=? AND endpoint_hash=?').get(entry.id, entry.business_id, hash(endpoint));
    if (row) removeSubscription(row.id);
  }
  function subscribed(entry, endpoint) {
    return !!db.prepare('SELECT id FROM push_subscriptions WHERE entry_id=? AND business_id=? AND endpoint_hash=? AND expires_at>?').get(entry.id, entry.business_id, hash(endpoint), now());
  }
  function authorization(endpoint) {
    const origin = new URL(endpoint).origin;
    const cached = db.prepare('SELECT * FROM push_vapid_cache WHERE origin=?').get(origin);
    if (cached && now()-cached.created_at < 3600000) return open(cached.encrypted);
    const headers = webpush.getVapidHeaders(origin, subject, identity.publicKey, identity.privateKey, 'aes128gcm', Math.floor(now()/1000)+12*3600);
    db.prepare('INSERT INTO push_vapid_cache(origin,encrypted,created_at) VALUES (?,?,?) ON CONFLICT(origin) DO UPDATE SET encrypted=excluded.encrypted,created_at=excluded.created_at').run(origin, seal(headers.Authorization), now());
    return headers.Authorization;
  }
  let stopped = false, running = null, timer;
  async function work() {
    cleanup();
    const jobs = db.prepare("SELECT * FROM push_outbox WHERE status='queued' AND next_attempt<=? ORDER BY id LIMIT 20").all(now());
    for (const job of jobs) {
      if (stopped) break;
      const s = db.prepare('SELECT * FROM push_subscriptions WHERE id=?').get(job.subscription_id);
      const e = db.prepare('SELECT e.*,b.active,b.slug FROM entries e JOIN businesses b ON b.id=e.business_id WHERE e.id=?').get(job.entry_id);
      if (!s || !e || !e.active || e.status !== 'ready' || e.ready_version !== job.ready_version || e.ready_ack_version>=e.ready_version || job.expires_at<=now()) {
        db.prepare('DELETE FROM push_outbox WHERE id=?').run(job.id); continue;
      }
      try {
        const subscription = validateSubscription(open(s.encrypted));
        const payload = {type:'ready',slug:e.slug,id:e.id,number:e.number,version:e.ready_version,
          lang:s.lang,expiresAt:job.expires_at,reminder:job.reminder_index,ack:capability('ack',e.business_id,e.id,e.ready_version)};
        await deliver(subscription, JSON.stringify(payload), {TTL:Math.max(1,Math.min(60,Math.floor((job.expires_at-now())/1000))),
          urgency:'high',topic:hash(`${e.business_id}:${e.id}`).slice(0,32),timeout:8000,
          vapidDetails:null,headers:{Authorization:authorization(subscription.endpoint)}});
        if (job.reminder_index<2) {
          db.prepare("UPDATE push_outbox SET reminder_index=reminder_index+1,attempts=0,next_attempt=? WHERE id=?").run(now()+30000,job.id);
        } else db.prepare("UPDATE push_outbox SET status='sent',attempts=attempts+1 WHERE id=?").run(job.id);
        db.prepare('UPDATE push_subscriptions SET last_sent_version=MAX(last_sent_version,?) WHERE id=?').run(e.ready_version,s.id);
      } catch (error) {
        // Never log endpoints, keys, payloads or provider response bodies.
        const code = Number(error.statusCode)||0;
        if ([404,410].includes(code)) removeSubscription(s.id);
        else if (job.attempts>=3 || (code>=400 && code<500 && code!==429)) {
          db.prepare("UPDATE push_outbox SET status='failed',attempts=attempts+1 WHERE id=?").run(job.id);
          console.warn('Push-Zustellung beendet; Fehlerklasse:',code||'network');
        } else {
          const retryAfter = Number(error.headers?.['retry-after']);
          const delay = Number.isFinite(retryAfter) && retryAfter>0 ? Math.min(retryAfter*1000,300000) : [5000,20000,60000][job.attempts];
          db.prepare('UPDATE push_outbox SET attempts=attempts+1,next_attempt=? WHERE id=?').run(now()+delay,job.id);
        }
      }
    }
  }
  function tick() {
    if (stopped) return Promise.resolve();
    if (!running) running = work().catch(() => console.warn('Push-Arbeiter: interner Fehler, erneuter Versuch folgt.')).finally(() => {running=null;});
    return running;
  }
  function start() { if (!timer) { tick(); timer=setInterval(tick,2000);timer.unref(); } }
  async function stop() { stopped=true; clearInterval(timer); if (running) await running; }
  return {publicKey:identity.publicKey,capability,validAck,acknowledge,authorized,subscribe,unsubscribe,subscribed,onStatus,removeTicket,cleanup,start,stop,tick};
};
module.exports.hash = hash;
module.exports.validToken = validToken;
module.exports.validateSubscription = validateSubscription;
