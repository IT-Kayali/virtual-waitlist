'use strict';
/*
 * QueueUp – Virtuelle Warteliste als Multi-Tenant-SaaS
 * Mehrere Geschaefte (Cafes/Restaurants) mit je eigener Warteschlange,
 * eigenem QR-Code/Link, eigenem Personal-Dashboard, Mitarbeiter-Konten
 * mit individuellen PINs, Mitarbeiter-Reports und Inhaber-Bereich.
 * Daten sind strikt pro Geschaeft (business_id) getrennt.
 *
 * Zero Dependencies: Node.js >= 22 (HTTP-Server + eingebautes SQLite).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const SEED_PIN = process.env.STAFF_PIN || '0000'; // PIN des Demo-Geschaefts (nur Erstsetup/Migration)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();   // Plattform-Admin (SaaS-Inhaber)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOGO_DIR = path.join(DATA_DIR, 'logos');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOGO_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'queue.db'));

// ---------- Schema & Migration ----------
function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'geschaeft';
}
function uniqueSlug(base) {
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT id FROM businesses WHERE slug = ?').get(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}
function hashSecret(secret, salt) {
  return crypto.scryptSync(String(secret), salt, 64).toString('hex');
}
function hashPin(pin, salt) {
  return crypto.scryptSync('pin:' + String(pin), salt, 32).toString('hex');
}

function createBusiness({ name, email, password, pin, slug: wantedSlug }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const pinSalt = crypto.randomBytes(16).toString('hex');
  const slug = uniqueSlug(wantedSlug || slugify(name));
  const info = db.prepare(
    `INSERT INTO businesses (slug, name, email, pass_hash, salt, pin_hash, pin_salt)
     VALUES (?,?,?,?,?,?,?)`
  ).run(slug, name.trim().slice(0, 80), (email || '').toLowerCase().trim(),
    hashSecret(password, salt), salt, hashPin(pin, pinSalt), pinSalt);
  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
}

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  logo_ext TEXT,
  notify_ahead INTEGER NOT NULL DEFAULT 2,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  kind TEXT NOT NULL DEFAULT 'pin',           -- pin | owner | employee
  employee_id INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'allgemein',      -- allgemein | demo | vertrieb
  name TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'neu',          -- neu | in_bearbeitung | erledigt
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_at TEXT
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  interval_text TEXT NOT NULL DEFAULT 'Monat',
  features TEXT NOT NULL DEFAULT '',           -- ein Feature pro Zeile
  highlighted INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT NOT NULL DEFAULT '',
  paypal_plan_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  provider TEXT NOT NULL DEFAULT 'manual',     -- stripe | paypal | manual
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | active | cancelled | past_due
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const ENTRIES_DDL = `
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    day TEXT NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting',
    source TEXT NOT NULL DEFAULT 'guest',      -- guest | counter | staff
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ready_at TEXT,
    done_at TEXT,
    ready_by INTEGER REFERENCES employees(id),
    done_by INTEGER REFERENCES employees(id),
    UNIQUE (business_id, day, number)
  );
`;

const isLegacy = tableExists('entries') &&
  !db.prepare("SELECT 1 FROM pragma_table_info('entries') WHERE name='business_id'").get();

if (isLegacy) {
  // Migration von Version 0 (Single-Tenant) auf Multi-Tenant
  const demo = createBusiness({
    name: (tableExists('settings') &&
      (db.prepare("SELECT value FROM settings WHERE key='venue_name'").get() || {}).value) || 'QueueUp Café',
    email: 'demo@queueup.app',
    password: crypto.randomBytes(24).toString('hex'),
    pin: SEED_PIN,
    slug: 'demo',
  });
  db.exec(`
    CREATE TABLE entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      day TEXT NOT NULL,
      number INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      source TEXT NOT NULL DEFAULT 'guest',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ready_at TEXT,
      done_at TEXT,
      ready_by INTEGER REFERENCES employees(id),
      done_by INTEGER REFERENCES employees(id),
      UNIQUE (business_id, day, number)
    );
    INSERT INTO entries_new (id, business_id, day, number, name, note, status, source, created_at, ready_at, done_at)
      SELECT id, ${demo.id}, day, number, name, note, status, source, created_at, ready_at, done_at FROM entries;
    DROP TABLE entries;
    ALTER TABLE entries_new RENAME TO entries;
  `);
  console.log(`Migration: bestehende Warteschlange -> Geschaeft "${demo.name}" (/${demo.slug})`);
} else {
  db.exec(ENTRIES_DDL);
  if (!db.prepare('SELECT id FROM businesses LIMIT 1').get()) {
    createBusiness({ name: 'QueueUp Café', email: 'demo@queueup.app',
      password: crypto.randomBytes(24).toString('hex'), pin: SEED_PIN, slug: 'demo' });
    console.log('Demo-Geschaeft angelegt: /b/demo');
  }
}
db.exec('PRAGMA user_version = 1;');
// Schema-Nachzug fuer bestehende v1-Datenbanken
if (!db.prepare("SELECT 1 FROM pragma_table_info('businesses') WHERE name='logo_ext'").get()) {
  db.exec('ALTER TABLE businesses ADD COLUMN logo_ext TEXT');
}
if (!db.prepare("SELECT 1 FROM pragma_table_info('businesses') WHERE name='notify_ahead'").get()) {
  db.exec('ALTER TABLE businesses ADD COLUMN notify_ahead INTEGER NOT NULL DEFAULT 2');
}
if (!db.prepare("SELECT 1 FROM pragma_table_info('businesses') WHERE name='active'").get()) {
  db.exec('ALTER TABLE businesses ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}

// Standard-Abo-Modelle (vom Plattform-Admin im /admin-Bereich aenderbar)
if (!db.prepare('SELECT id FROM plans LIMIT 1').get()) {
  const ins = db.prepare(`INSERT INTO plans (slug, name, description, price_cents, interval_text, features, highlighted, sort_order)
    VALUES (?,?,?,?,?,?,?,?)`);
  ins.run('starter', 'Starter', 'Zum Ausprobieren und für kleine Betriebe', 0, 'Monat',
    '1 Warteschlange\nQR-Code & persönlicher Link\nLive-Dashboard\nGäste-Ansicht DE/EN/AR\nDSGVO-konform, Server in der EU', 0, 1);
  ins.run('pro', 'Pro', 'Für Cafés und Restaurants im Alltag', 1900, 'Monat',
    'Alles aus Starter\nMitarbeiter-Konten mit eigenen PINs\nKiosk-Modus für den Tresen\nReports & Mitarbeiter-Statistiken\nEigenes Logo\nPrioritäts-Support', 1, 2);
  ins.run('business', 'Business', 'Für größere Betriebe und Ketten', 4900, 'Monat',
    'Alles aus Pro\nMehrere Standorte (in Vorbereitung)\nPersönliche Einrichtung\nTelefon-Support', 0, 3);
  console.log('Standard-Abo-Modelle angelegt (Starter/Pro/Business).');
}

// Standard-Inhalte der oeffentlichen Webseite (vom Plattform-Admin aenderbar)
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_content (key, value) VALUES (?,?)');
  ins.run('hero_title', 'Schluss mit Warteschlangen vor der Tür.');
  ins.run('hero_sub', 'QueueUp ist die digitale Warteliste für Cafés, Restaurants und Praxen: Ihre Gäste reihen sich per QR-Code oder Link ein – ganz ohne App – und sehen live, wann sie an der Reihe sind.');
  ins.run('contact_email', 'kontakt@queueup.app');
  ins.run('impressum_name', '');
  ins.run('impressum_street', '');
  ins.run('impressum_city', '');
  ins.run('impressum_email', '');
  ins.run('impressum_phone', '');
  ins.run('impressum_verantwortlich', '');
  ins.run('datenschutz_stand', 'November 2026');
}

const LOGO_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function logoPath(biz) {
  return biz.logo_ext ? path.join(LOGO_DIR, `${biz.id}${biz.logo_ext}`) : null;
}

// ---------- Helpers ----------
function getBusiness(slug) {
  return db.prepare('SELECT * FROM businesses WHERE slug = ? AND active = 1').get(slug);
}
function today() {
  return db.prepare("SELECT date('now') AS d").get().d;
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentSession(req) {
  const sid = parseCookies(req).staff_sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(sid);
  if (!s) return null;
  const session = { ...s, business: db.prepare('SELECT * FROM businesses WHERE id = ?').get(s.business_id) };
  if (!session.business || !session.business.active) return null; // gesperrtes Geschaeft -> ausgeloggt
  if (s.employee_id) {
    session.employee = db.prepare('SELECT id, name FROM employees WHERE id = ? AND active = 1').get(s.employee_id) || null;
  }
  return session;
}
function currentAdmin(req) {
  const sid = parseCookies(req).admin_sid;
  if (!sid) return null;
  return db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(sid) || null;
}
function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return; // weiter lesen (drain), aber nicht speichern
      data += c;
      if (data.length > limit) { tooBig = true; data = ''; }
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('Body zu gross'));
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Ungueltiges JSON')); }
    });
  });
}
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(obj));
}
function sessionCookie(token) {
  return `staff_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`;
}
function newSession(bizId, kind, employeeId = null) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, business_id, kind, employee_id) VALUES (?,?,?,?)')
    .run(token, bizId, kind, employeeId);
  return token;
}

function avgServiceMinutes(bizId, day) {
  const row = db.prepare(
    `SELECT AVG((julianday(COALESCE(done_at, ready_at)) - julianday(created_at)) * 1440.0) AS m
     FROM entries WHERE business_id = ? AND day = ? AND ready_at IS NOT NULL AND status IN ('ready','done')`
  ).get(bizId, day);
  const m = row && row.m;
  return m && m > 0.5 ? Math.round(m * 10) / 10 : 5;
}
function ticketView(e, biz) {
  const ahead = e.status === 'waiting'
    ? db.prepare("SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = 'waiting' AND number < ?")
        .get(e.business_id, e.day, e.number).c
    : 0;
  return {
    id: e.id, number: e.number, name: e.name, note: e.note, status: e.status, source: e.source,
    created_at: e.created_at, ready_at: e.ready_at, ahead,
    waiting_total: db.prepare("SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = 'waiting'")
      .get(e.business_id, e.day).c,
    notify_ahead: biz.notify_ahead,
    est_minutes: e.status === 'waiting' ? Math.max(1, Math.round(ahead * avgServiceMinutes(e.business_id, e.day))) : 0,
    venue: biz.name, slug: biz.slug,
  };
}
function queueStats(bizId, day) {
  const g = (s) => db.prepare('SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = ?').get(bizId, day, s).c;
  return { waiting: g('waiting'), ready: g('ready'), served: g('done'), avg_minutes: avgServiceMinutes(bizId, day) };
}

// ---------- API ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  routes.push({ method, pattern, handler, staff: !!opts.staff, owner: !!opts.owner, admin: !!opts.admin });
}

// Geschaeft registrieren
route('POST', '/api/signup', async (req, res) => {
  const b = await readBody(req);
  const name = String(b.venue_name || '').trim();
  const email = String(b.email || '').toLowerCase().trim();
  const password = String(b.password || '');
  const pin = String(b.pin || '').trim();
  if (!name || !email.includes('@') || password.length < 6 || !/^\d{4,8}$/.test(pin)) {
    return send(res, 400, { error: 'Name, gueltige E-Mail, Passwort (min. 6 Zeichen) und PIN (4-8 Ziffern) erforderlich.' });
  }
  if (db.prepare('SELECT id FROM businesses WHERE email = ?').get(email)) {
    return send(res, 409, { error: 'Diese E-Mail ist bereits registriert.' });
  }
  const biz = createBusiness({ name, email, password, pin });
  send(res, 200, { slug: biz.slug, name: biz.name }, { 'Set-Cookie': sessionCookie(newSession(biz.id, 'owner')) });
});

// Inhaber-Login (E-Mail + Passwort)
route('POST', '/api/login', async (req, res) => {
  const b = await readBody(req);
  const biz = db.prepare('SELECT * FROM businesses WHERE email = ?').get(String(b.email || '').toLowerCase().trim());
  if (!biz || hashSecret(b.password || '', biz.salt) !== biz.pass_hash) {
    return send(res, 401, { error: 'E-Mail oder Passwort falsch.' });
  }
  send(res, 200, { slug: biz.slug, name: biz.name }, { 'Set-Cookie': sessionCookie(newSession(biz.id, 'owner')) });
});

route('POST', '/api/logout', async (req, res) => {
  const sid = parseCookies(req).staff_sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'staff_sid=; HttpOnly; Path=/; Max-Age=0' });
});

route('GET', '/api/me', async (req, res, _u, _p, _q, session) => {
  send(res, 200, { slug: session.business.slug, name: session.business.name,
    email: session.business.email, kind: session.kind,
    employee: session.employee ? session.employee.name : null });
}, { staff: true });

// Personal-Login per PIN: Geschaefts-PIN ODER Mitarbeiter-PIN (pro Geschaeft)
route('POST', '/api/b/:slug/staff/login', async (req, res, _u, p) => {
  const biz = getBusiness(p.slug);
  if (!biz) return send(res, 404, { error: 'Geschaeft nicht gefunden.' });
  const b = await readBody(req);
  const pin = String(b.pin || '');
  if (hashPin(pin, biz.pin_salt) === biz.pin_hash) {
    return send(res, 200, { ok: true, slug: biz.slug, name: biz.name, kind: 'pin' },
      { 'Set-Cookie': sessionCookie(newSession(biz.id, 'pin')) });
  }
  const emps = db.prepare('SELECT * FROM employees WHERE business_id = ? AND active = 1').all(biz.id);
  const emp = emps.find((e) => hashPin(pin, e.pin_salt) === e.pin_hash);
  if (emp) {
    return send(res, 200, { ok: true, slug: biz.slug, name: biz.name, kind: 'employee', employee: emp.name },
      { 'Set-Cookie': sessionCookie(newSession(biz.id, 'employee', emp.id)) });
  }
  send(res, 401, { error: 'Falsche PIN.' });
});

// Oeffentliche Geschaeftsdaten
route('GET', '/api/b/:slug/settings', async (req, res, _u, p) => {
  const biz = getBusiness(p.slug);
  if (!biz) return send(res, 404, { error: 'Geschaeft nicht gefunden.' });
  send(res, 200, { venue: biz.name, slug: biz.slug, has_logo: !!biz.logo_ext });
});

// Logo abrufen (oeffentlich)
route('GET', '/api/b/:slug/logo', async (req, res, _u, p) => {
  const biz = getBusiness(p.slug);
  const file = biz && logoPath(biz);
  if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'Kein Logo.' });
  res.writeHead(200, { 'Content-Type': LOGO_MIME[biz.logo_ext], 'Cache-Control': 'public, max-age=300' });
  fs.createReadStream(file).pipe(res);
});

// Logo hochladen (Personal, max. 2 MB, PNG/JPEG/WebP/SVG)
route('POST', '/api/staff/logo', async (req, res, _u, _p, _q, session) => {
  const b = await readBody(req, 4e6);
  const m = String(b.data || '').match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return send(res, 400, { error: 'Nur PNG, JPEG, WebP oder SVG als data-URL.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return send(res, 400, { error: 'Logo zu gross (max. 2 MB).' });
  const ext = { png: '.png', jpeg: '.jpg', webp: '.webp', 'svg+xml': '.svg' }[m[1]];
  const biz = session.business;
  const old = logoPath(biz);
  if (old && old !== path.join(LOGO_DIR, `${biz.id}${ext}`) && fs.existsSync(old)) fs.unlinkSync(old);
  fs.writeFileSync(path.join(LOGO_DIR, `${biz.id}${ext}`), buf);
  db.prepare('UPDATE businesses SET logo_ext = ? WHERE id = ?').run(ext, biz.id);
  send(res, 200, { ok: true, logo_url: `/api/b/${biz.slug}/logo` });
}, { staff: true });

// Logo entfernen (Personal)
route('POST', '/api/staff/logo/remove', async (req, res, _u, _p, _q, session) => {
  const biz = session.business;
  const file = logoPath(biz);
  if (file && fs.existsSync(file)) fs.unlinkSync(file);
  db.prepare('UPDATE businesses SET logo_ext = NULL WHERE id = ?').run(biz.id);
  send(res, 200, { ok: true });
}, { staff: true });

// Gast tritt bei (Selbstbedienung oder Tresen/Kiosk)
route('POST', '/api/b/:slug/join', async (req, res, _u, p) => {
  const biz = getBusiness(p.slug);
  if (!biz) return send(res, 404, { error: 'Geschaeft nicht gefunden.' });
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  const note = String(b.note || '').trim().slice(0, 200);
  const source = ['guest', 'counter'].includes(b.source) ? b.source : 'guest';
  const day = today();
  const next = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM entries WHERE business_id = ? AND day = ?').get(biz.id, day).n;
  const info = db.prepare(
    'INSERT INTO entries (business_id, day, number, name, note, source) VALUES (?,?,?,?,?,?)'
  ).run(biz.id, day, next, name, note, source);
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  send(res, 200, { ticket: ticketView(e, biz) });
});

function ticketForGuest(slug, id) {
  const biz = getBusiness(slug);
  if (!biz) return {};
  const e = db.prepare('SELECT * FROM entries WHERE id = ? AND business_id = ?').get(Number(id), biz.id);
  return { biz, e };
}

route('GET', '/api/b/:slug/ticket/:id', async (req, res, _u, p) => {
  const { biz, e } = ticketForGuest(p.slug, p.id);
  if (!e) return send(res, 404, { error: 'Ticket nicht gefunden.' });
  send(res, 200, { ticket: ticketView(e, biz) });
});

route('POST', '/api/b/:slug/ticket/:id/cancel', async (req, res, _u, p) => {
  const { e } = ticketForGuest(p.slug, p.id);
  if (!e) return send(res, 404, { error: 'Ticket nicht gefunden.' });
  if (e.status === 'waiting') {
    db.prepare("UPDATE entries SET status = 'cancelled' WHERE id = ?").run(e.id);
  }
  send(res, 200, { ok: true });
});

// ---------- Plattform-Admin (SaaS-Inhaber) ----------
route('POST', '/api/admin/login', async (req, res) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return send(res, 403, { error: 'Admin-Zugang ist nicht konfiguriert (ADMIN_EMAIL/ADMIN_PASSWORD).' });
  }
  const b = await readBody(req);
  if (String(b.email || '').toLowerCase().trim() !== ADMIN_EMAIL || String(b.password || '') !== ADMIN_PASSWORD) {
    return send(res, 401, { error: 'E-Mail oder Passwort falsch.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO admin_sessions (token) VALUES (?)').run(token);
  send(res, 200, { ok: true }, { 'Set-Cookie': `admin_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200` });
});

route('POST', '/api/admin/logout', async (req, res) => {
  const sid = parseCookies(req).admin_sid;
  if (sid) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(sid);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'admin_sid=; HttpOnly; Path=/; Max-Age=0' });
});

route('GET', '/api/admin/overview', async (req, res) => {
  const day = today();
  const rows = db.prepare('SELECT * FROM businesses ORDER BY created_at DESC').all().map((b) => ({
    id: b.id, slug: b.slug, name: b.name, email: b.email, active: !!b.active,
    created_at: b.created_at, has_logo: !!b.logo_ext, notify_ahead: b.notify_ahead,
    employees: db.prepare('SELECT COUNT(*) AS c FROM employees WHERE business_id = ? AND active = 1').get(b.id).c,
    waiting: db.prepare("SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = 'waiting'").get(b.id, day).c,
    ready: db.prepare("SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = 'ready'").get(b.id, day).c,
    served_today: db.prepare("SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ? AND status = 'done'").get(b.id, day).c,
    tickets_total: db.prepare('SELECT COUNT(*) AS c FROM entries WHERE business_id = ?').get(b.id).c,
  }));
  send(res, 200, { businesses: rows, count: rows.length });
}, { admin: true });

route('POST', '/api/admin/business/:id/active', async (req, res, _u, p) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(p.id));
  if (!biz) return send(res, 404, { error: 'Geschaeft nicht gefunden.' });
  const b = await readBody(req);
  const active = b.active ? 1 : 0;
  db.prepare('UPDATE businesses SET active = ? WHERE id = ?').run(active, biz.id);
  if (!active) db.prepare('DELETE FROM sessions WHERE business_id = ?').run(biz.id); // alle Sessions beenden
  send(res, 200, { ok: true, id: biz.id, active: !!active });
}, { admin: true });

// ---------- Personal-Endpunkte (Session an Geschaeft gebunden) ----------
route('POST', '/api/staff/logout', async (req, res) => {
  const sid = parseCookies(req).staff_sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'staff_sid=; HttpOnly; Path=/; Max-Age=0' });
});

route('GET', '/api/staff/queue', async (req, res, _u, _p, _q, session) => {
  const biz = session.business;
  const day = today();
  const waiting = db.prepare(
    "SELECT * FROM entries WHERE business_id = ? AND day = ? AND status = 'waiting' ORDER BY number").all(biz.id, day);
  const ready = db.prepare(
    "SELECT * FROM entries WHERE business_id = ? AND day = ? AND status = 'ready' ORDER BY ready_at").all(biz.id, day);
  send(res, 200, {
    venue: biz.name, slug: biz.slug, kind: session.kind,
    employee: session.employee ? session.employee.name : null,
    has_logo: !!biz.logo_ext, notify_ahead: biz.notify_ahead,
    waiting: waiting.map((e) => ticketView(e, biz)),
    ready: ready.map((e) => ticketView(e, biz)),
    stats: queueStats(biz.id, day),
  });
}, { staff: true });

route('POST', '/api/staff/add', async (req, res, _u, _p, _q, session) => {
  const biz = session.business;
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  const note = String(b.note || '').trim().slice(0, 200);
  const day = today();
  const next = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM entries WHERE business_id = ? AND day = ?').get(biz.id, day).n;
  const info = db.prepare(
    "INSERT INTO entries (business_id, day, number, name, note, source) VALUES (?,?,?,?,?,'staff')"
  ).run(biz.id, day, next, name, note);
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  send(res, 200, { entry: ticketView(e, biz) });
}, { staff: true });

route('POST', '/api/staff/entry/:id/status', async (req, res, _u, p, _q, session) => {
  const biz = session.business;
  const e = db.prepare('SELECT * FROM entries WHERE id = ? AND business_id = ?').get(Number(p.id), biz.id);
  if (!e) return send(res, 404, { error: 'Eintrag nicht gefunden.' });
  const b = await readBody(req);
  const s = String(b.status || '');
  if (!['waiting', 'ready', 'done', 'cancelled'].includes(s)) {
    return send(res, 400, { error: 'Ungueltiger Status.' });
  }
  const sets = ['status = ?'];
  const vals = [s];
  if (s === 'ready') {
    sets.push("ready_at = datetime('now')");
    if (session.employee_id) { sets.push('ready_by = ?'); vals.push(session.employee_id); }
  }
  if (s === 'done') {
    sets.push("done_at = datetime('now')");
    if (session.employee_id) { sets.push('done_by = ?'); vals.push(session.employee_id); }
  }
  vals.push(e.id);
  db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(e.id);
  send(res, 200, { entry: ticketView(updated, biz) });
}, { staff: true });

route('POST', '/api/staff/settings', async (req, res, _u, _p, _q, session) => {
  const biz = session.business;
  const b = await readBody(req);
  if (b.venue_name !== undefined && String(b.venue_name).trim()) {
    db.prepare('UPDATE businesses SET name = ? WHERE id = ?').run(String(b.venue_name).trim().slice(0, 80), biz.id);
  }
  if (b.new_pin !== undefined) {
    if (session.kind !== 'owner') {
      return send(res, 403, { error: 'PIN aendern nur mit Inhaber-Login (E-Mail + Passwort).' });
    }
    if (!/^\d{4,8}$/.test(String(b.new_pin))) {
      return send(res, 400, { error: 'Neue PIN muss 4-8 Ziffern haben.' });
    }
    const pinSalt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE businesses SET pin_hash = ?, pin_salt = ? WHERE id = ?')
      .run(hashPin(b.new_pin, pinSalt), pinSalt, biz.id);
  }
  if (b.notify_ahead !== undefined) {
    if (session.kind !== 'owner') {
      return send(res, 403, { error: 'Benachrichtigungs-Schwelle nur mit Inhaber-Login.' });
    }
    const n = Number(b.notify_ahead);
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      return send(res, 400, { error: 'Schwelle muss eine ganze Zahl von 0 bis 20 sein.' });
    }
    db.prepare('UPDATE businesses SET notify_ahead = ? WHERE id = ?').run(n, biz.id);
  }
  const updated = db.prepare('SELECT * FROM businesses WHERE id = ?').get(biz.id);
  send(res, 200, { venue: updated.name, slug: updated.slug, has_logo: !!updated.logo_ext,
    notify_ahead: updated.notify_ahead });
}, { staff: true });

// ---------- Mitarbeiter-Verwaltung & Reports (nur Inhaber) ----------
route('GET', '/api/staff/employees', async (req, res, _u, _p, _q, session) => {
  const emps = db.prepare(
    'SELECT id, name, active, created_at FROM employees WHERE business_id = ? ORDER BY name'
  ).all(session.business.id);
  send(res, 200, { employees: emps });
}, { staff: true, owner: true });

route('POST', '/api/staff/employees', async (req, res, _u, _p, _q, session) => {
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  const pin = String(b.pin || '').trim();
  if (!name || !/^\d{4,8}$/.test(pin)) {
    return send(res, 400, { error: 'Name und PIN (4-8 Ziffern) erforderlich.' });
  }
  const pinSalt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare(
    'INSERT INTO employees (business_id, name, pin_hash, pin_salt) VALUES (?,?,?,?)'
  ).run(session.business.id, name, hashPin(pin, pinSalt), pinSalt);
  send(res, 200, { employee: { id: info.lastInsertRowid, name, active: 1 } });
}, { staff: true, owner: true });

route('POST', '/api/staff/employees/:id/remove', async (req, res, _u, p, _q, session) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND business_id = ?')
    .get(Number(p.id), session.business.id);
  if (!emp) return send(res, 404, { error: 'Mitarbeiter nicht gefunden.' });
  db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(emp.id);
  db.prepare('DELETE FROM sessions WHERE employee_id = ?').run(emp.id);
  send(res, 200, { ok: true });
}, { staff: true, owner: true });

route('GET', '/api/staff/reports', async (req, res, _u, _p, _q, session) => {
  const bizId = session.business.id;
  const day = today();
  const rows = db.prepare(`
    SELECT e.id, e.name,
      (SELECT COUNT(*) FROM entries x WHERE x.ready_by = e.id AND x.day = ?) AS ready_count,
      (SELECT COUNT(*) FROM entries x WHERE x.done_by = e.id AND x.day = ?) AS done_count,
      (SELECT ROUND(AVG((julianday(x.ready_at) - julianday(x.created_at)) * 1440.0), 1)
         FROM entries x WHERE x.ready_by = e.id AND x.day = ? AND x.ready_at IS NOT NULL) AS avg_ready_min
    FROM employees e
    WHERE e.business_id = ? AND e.active = 1
    ORDER BY e.name
  `).all(day, day, day, bizId);
  const unattributed = db.prepare(
    `SELECT COUNT(*) AS c FROM entries WHERE business_id = ? AND day = ?
       AND ready_at IS NOT NULL AND ready_by IS NULL`
  ).get(bizId, day).c;
  send(res, 200, { day, employees: rows, unattributed_ready: unattributed });
}, { staff: true, owner: true });

// ---------- DSGVO: automatische Datenloeschung ----------
// Fertige/stornierte Tickets nach 24 h, alles nach 48 h, abgelaufene Sessions nach 12 h.
function cleanupOldData() {
  const r1 = db.prepare(
    "DELETE FROM entries WHERE status IN ('done','cancelled') AND created_at < datetime('now','-1 day')"
  ).run();
  const r2 = db.prepare("DELETE FROM entries WHERE created_at < datetime('now','-2 days')").run();
  const r3 = db.prepare("DELETE FROM sessions WHERE created_at < datetime('now','-12 hours')").run();
  const r4 = db.prepare("DELETE FROM admin_sessions WHERE created_at < datetime('now','-12 hours')").run();
  const n = r1.changes + r2.changes + r3.changes + r4.changes;
  if (n > 0) console.log(`Datenloeschung: ${n} Datensaetze entfernt (Aufbewahrungsfrist).`);
}
cleanupOldData();
setInterval(cleanupOldData, 60 * 60 * 1000).unref();


// ---------- Oeffentliche Webseite ----------
const INQUIRY_TYPES = new Set(['allgemein', 'demo', 'vertrieb']);
const INQUIRY_STATUS = new Set(['neu', 'in_bearbeitung', 'erledigt']);

// Anfrage vom Kontaktformular entgegennehmen
route('POST', '/api/public/inquiry', async (req, res) => {
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 80);
  const email = String(b.email || '').toLowerCase().trim().slice(0, 120);
  const message = String(b.message || '').trim().slice(0, 2000);
  const type = INQUIRY_TYPES.has(b.type) ? b.type : 'allgemein';
  if (!name || !email.includes('@') || !message) {
    return send(res, 400, { error: 'Bitte Name, gueltige E-Mail und Nachricht ausfuellen.' });
  }
  db.prepare(`INSERT INTO inquiries (type, name, business_name, email, phone, message)
    VALUES (?,?,?,?,?,?)`).run(type, name, String(b.business_name || '').trim().slice(0, 80),
    email, String(b.phone || '').trim().slice(0, 40), message);
  return send(res, 201, { ok: true });
});

// Aktive Abo-Modelle (oeffentlich, ohne interne Anbieter-IDs)
route('GET', '/api/public/plans', async (req, res) => {
  const plans = db.prepare(`SELECT slug, name, description, price_cents, currency, interval_text, features, highlighted
    FROM plans WHERE active = 1 ORDER BY sort_order, id`).all();
  return send(res, 200, { plans });
});

// Pflegbare Inhalte der Webseite (oeffentlich)
route('GET', '/api/public/content', async (req, res) => {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM site_content').all()) out[r.key] = r.value;
  return send(res, 200, out);
});

// ---------- Plattform-Admin: Anfragen ----------
route('GET', '/api/admin/inquiries', async (req, res) => {
  const inquiries = db.prepare('SELECT * FROM inquiries ORDER BY id DESC LIMIT 500').all();
  const counts = { neu: 0, in_bearbeitung: 0, erledigt: 0 };
  for (const i of inquiries) counts[i.status] = (counts[i.status] || 0) + 1;
  return send(res, 200, { inquiries, counts, total: inquiries.length });
}, { admin: true });

route('POST', '/api/admin/inquiry/:id/status', async (req, res, _u, p) => {
  const inq = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(Number(p.id));
  if (!inq) return send(res, 404, { error: 'Anfrage nicht gefunden.' });
  const b = await readBody(req);
  const status = INQUIRY_STATUS.has(b.status) ? b.status : inq.status;
  const note = b.note !== undefined ? String(b.note).slice(0, 1000) : inq.note;
  db.prepare(`UPDATE inquiries SET status = ?, note = ?,
    handled_at = CASE WHEN ? = 'neu' THEN NULL ELSE COALESCE(handled_at, datetime('now')) END
    WHERE id = ?`).run(status, note, status, inq.id);
  return send(res, 200, { ok: true });
}, { admin: true });

// ---------- Plattform-Admin: Abo-Modelle ----------
route('GET', '/api/admin/plans', async (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY sort_order, id').all();
  return send(res, 200, { plans });
}, { admin: true });

route('POST', '/api/admin/plans', async (req, res) => {
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) return send(res, 400, { error: 'Name fehlt.' });
  let slug = String(b.slug || slugify(name)).slice(0, 40) || 'plan';
  for (let i = 2; db.prepare('SELECT id FROM plans WHERE slug = ?').get(slug); i++) slug = `${slug.slice(0, 36)}-${i}`;
  const info = db.prepare(`INSERT INTO plans (slug, name, description, price_cents, currency, interval_text, features, highlighted, active, sort_order, stripe_price_id, paypal_plan_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    slug, name, String(b.description || '').slice(0, 200),
    Math.max(0, Math.round(Number(b.price_cents) || 0)),
    String(b.currency || 'EUR').slice(0, 3).toUpperCase(),
    String(b.interval_text || 'Monat').slice(0, 30),
    String(b.features || '').slice(0, 2000),
    b.highlighted ? 1 : 0, b.active === false ? 0 : 1,
    Math.round(Number(b.sort_order) || 0),
    String(b.stripe_price_id || '').trim().slice(0, 80),
    String(b.paypal_plan_id || '').trim().slice(0, 80));
  return send(res, 201, { ok: true, id: Number(info.lastInsertRowid), slug });
}, { admin: true });

route('POST', '/api/admin/plan/:id', async (req, res, _u, p) => {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(p.id));
  if (!plan) return send(res, 404, { error: 'Abo-Modell nicht gefunden.' });
  const b = await readBody(req);
  db.prepare(`UPDATE plans SET name=?, description=?, price_cents=?, currency=?, interval_text=?,
    features=?, highlighted=?, active=?, sort_order=?, stripe_price_id=?, paypal_plan_id=? WHERE id=?`).run(
    String(b.name ?? plan.name).trim().slice(0, 60) || plan.name,
    String(b.description ?? plan.description).slice(0, 200),
    Math.max(0, Math.round(Number(b.price_cents ?? plan.price_cents) || 0)),
    String(b.currency ?? plan.currency).slice(0, 3).toUpperCase(),
    String(b.interval_text ?? plan.interval_text).slice(0, 30),
    String(b.features ?? plan.features).slice(0, 2000),
    b.highlighted === undefined ? plan.highlighted : (b.highlighted ? 1 : 0),
    b.active === undefined ? plan.active : (b.active ? 1 : 0),
    b.sort_order === undefined ? plan.sort_order : Math.round(Number(b.sort_order) || 0),
    String(b.stripe_price_id ?? plan.stripe_price_id).trim().slice(0, 80),
    String(b.paypal_plan_id ?? plan.paypal_plan_id).trim().slice(0, 80),
    plan.id);
  return send(res, 200, { ok: true });
}, { admin: true });

// ---------- Plattform-Admin: Inhalte ----------
route('GET', '/api/admin/content', async (req, res) => {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM site_content').all()) out[r.key] = r.value;
  return send(res, 200, { content: out });
}, { admin: true });

route('POST', '/api/admin/content', async (req, res) => {
  const b = await readBody(req);
  const entries = b.entries && typeof b.entries === 'object' ? b.entries : {};
  const up = db.prepare(`INSERT INTO site_content (key, value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  for (const [k, v] of Object.entries(entries)) {
    if (!/^[a-z0-9_]{1,60}$/.test(k)) continue;
    up.run(k, String(v).slice(0, 4000));
  }
  return send(res, 200, { ok: true });
}, { admin: true });

// Konfigurationsstatus der Zahlungsanbieter (keine Werte, nur ob gesetzt)
route('GET', '/api/admin/config', async (req, res) => {
  return send(res, 200, {
    stripe: { secret_key: !!process.env.STRIPE_SECRET_KEY, publishable_key: !!process.env.STRIPE_PUBLISHABLE_KEY, webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET },
    paypal: { client_id: !!process.env.PAYPAL_CLIENT_ID, client_secret: !!process.env.PAYPAL_CLIENT_SECRET, env: process.env.PAYPAL_ENV || 'sandbox' },
  });
}, { admin: true });

// ---------- Plattform-Admin: Abos ----------
route('GET', '/api/admin/subscriptions', async (req, res) => {
  const subs = db.prepare(`SELECT s.*, b.name AS business_name, b.slug, p.name AS plan_name
    FROM subscriptions s JOIN businesses b ON b.id = s.business_id JOIN plans p ON p.id = s.plan_id
    ORDER BY s.id DESC LIMIT 500`).all();
  return send(res, 200, { subscriptions: subs });
}, { admin: true });

// ---------- Server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        const names = [];
        const rx = new RegExp('^' + r.pattern.replace(/:[^/]+/g, (m) => {
          names.push(m.slice(1));
          return '([^/]+)';
        }) + '$');
        const match = pathname.match(rx);
        if (match && r.method === req.method) {
          const params = {};
          names.forEach((n, i) => { params[n] = match[i + 1]; });
          const session = currentSession(req);
          const admin = currentAdmin(req);
          if (r.admin && !admin) {
            return send(res, 401, { error: 'Nicht als Admin angemeldet.' });
          }
          if (r.staff && !session) {
            return send(res, 401, { error: 'Nicht angemeldet.' });
          }
          if (r.owner && session.kind !== 'owner') {
            return send(res, 403, { error: 'Nur fuer Inhaber.' });
          }
          return await r.handler(req, res, null, params, url.searchParams, session);
        }
      }
      return send(res, 404, { error: 'Nicht gefunden.' });
    }

    // Alte Links (Single-Tenant-Aera) sauber umleiten
    if (pathname === '/ticket' && url.searchParams.get('id')) {
      const e = db.prepare('SELECT e.id, b.slug FROM entries e JOIN businesses b ON b.id = e.business_id WHERE e.id = ?')
        .get(Number(url.searchParams.get('id')));
      const target = e ? `/b/${e.slug}/ticket?id=${e.id}` : '/';
      res.writeHead(302, { Location: target });
      return res.end();
    }
    if (pathname === '/staff') {
      res.writeHead(302, { Location: '/anmelden' });
      return res.end();
    }

    // Seiten-Routing
    let file = pathname;
    const bizPage = pathname.match(/^\/b\/([^/]+)(\/(ticket|staff|kiosk|privacy))?\/?$/);
    const pageMap = {
      '/': '/home.html',
      '/anmelden': '/landing.html',
      '/preise': '/pricing.html',
      '/kontakt': '/contact.html',
      '/impressum': '/impressum.html',
      '/datenschutz': '/datenschutz.html',
      '/privacy': '/privacy.html',
      '/admin': '/admin.html',
    };
    if (pageMap[pathname]) {
      file = pageMap[pathname];
    } else if (bizPage) {
      file = bizPage[3] === 'ticket' ? '/ticket.html'
        : bizPage[3] === 'staff' ? '/staff.html'
        : bizPage[3] === 'kiosk' ? '/kiosk.html'
        : bizPage[3] === 'privacy' ? '/privacy.html'
        : '/index.html';
    }
    const filePath = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Verboten.' });
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Nicht gefunden.');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    if (e && (e.message === 'Body zu gross' || e.message === 'Ungueltiges JSON')) {
      return send(res, 400, { error: e.message + '.' });
    }
    console.error(e);
    send(res, 500, { error: 'Serverfehler.' });
  }
});

server.listen(PORT, () => {
  console.log(`QueueUp SaaS laeuft: http://localhost:${PORT}`);
});
