'use strict';
/*
 * QueueUp – virtuelle Warteliste für Cafés/Restaurants (MVP)
 * Ersetzt physische Pager-Geräte: Gäste reihen sich per Link/QR-Code ein,
 * sehen ihre Nummer live im Browser; Mitarbeiter rufen Nummern per Knopfdruck auf.
 *
 * Zero Dependencies: Node.js >= 22 (HTTP-Server + eingebautes SQLite).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const STAFF_PIN = process.env.STAFF_PIN || '0000';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'queue.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                -- YYYY-MM-DD (für Tages-Nummerierung)
  number INTEGER NOT NULL,          -- laufende Nummer des Tages
  name TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',    -- Bestellung / Anmerkung
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting | ready | done | cancelled
  source TEXT NOT NULL DEFAULT 'guest',   -- guest | staff
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ready_at TEXT,
  done_at TEXT,
  UNIQUE (day, number)
);
CREATE TABLE IF NOT EXISTS staff_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}
function today() {
  return db.prepare("SELECT date('now') AS d").get().d;
}
function venueName() {
  return getSetting('venue_name', 'QueueUp Café');
}

// ---------- Helpers ----------
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isStaff(req) {
  const sid = parseCookies(req).staff_sid;
  return !!(sid && db.prepare('SELECT token FROM staff_sessions WHERE token = ?').get(sid));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) { req.destroy(); reject(new Error('Body zu gross')); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Ungueltiges JSON')); }
    });
  });
}
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(obj));
}

function avgServiceMinutes(day) {
  const row = db.prepare(
    `SELECT AVG((julianday(COALESCE(done_at, ready_at)) - julianday(created_at)) * 1440.0) AS m
     FROM entries WHERE day = ? AND ready_at IS NOT NULL AND status IN ('ready','done')`
  ).get(day);
  const m = row && row.m;
  return m && m > 0.5 ? Math.round(m * 10) / 10 : 5; // Fallback: 5 Minuten pro Nummer
}

function ticketView(e) {
  const ahead = e.status === 'waiting'
    ? db.prepare("SELECT COUNT(*) AS c FROM entries WHERE day = ? AND status = 'waiting' AND number < ?")
        .get(e.day, e.number).c
    : 0;
  return {
    id: e.id,
    number: e.number,
    name: e.name,
    note: e.note,
    status: e.status,
    created_at: e.created_at,
    ready_at: e.ready_at,
    ahead,
    est_minutes: e.status === 'waiting' ? Math.max(1, Math.round(ahead * avgServiceMinutes(e.day))) : 0,
    venue: venueName(),
  };
}

function queueStats(day) {
  const waiting = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE day = ? AND status = 'waiting'").get(day).c;
  const ready = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE day = ? AND status = 'ready'").get(day).c;
  const served = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE day = ? AND status = 'done'").get(day).c;
  return { waiting, ready, served, avg_minutes: avgServiceMinutes(day) };
}

// ---------- API ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  routes.push({ method, pattern, handler, staff: !!opts.staff });
}

// Gast tritt bei
route('POST', '/api/join', async (req, res) => {
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  const note = String(b.note || '').trim().slice(0, 200);
  const day = today();
  const next = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM entries WHERE day = ?').get(day).n;
  const info = db.prepare(
    "INSERT INTO entries (day, number, name, note, source) VALUES (?,?,?,?,'guest')"
  ).run(day, next, name, note);
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  send(res, 200, { ticket: ticketView(e) });
});

// Ticket-Status (Gast pollt)
route('GET', '/api/ticket/:id', async (req, res, _u, p) => {
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(p.id));
  if (!e) return send(res, 404, { error: 'Ticket nicht gefunden.' });
  send(res, 200, { ticket: ticketView(e) });
});

// Gast verlässt die Warteschlange
route('POST', '/api/ticket/:id/cancel', async (req, res, _u, p) => {
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(p.id));
  if (!e) return send(res, 404, { error: 'Ticket nicht gefunden.' });
  if (e.status === 'waiting') {
    db.prepare("UPDATE entries SET status = 'cancelled' WHERE id = ?").run(e.id);
  }
  send(res, 200, { ok: true });
});

// Mitarbeiter-Login (PIN)
route('POST', '/api/staff/login', async (req, res) => {
  const b = await readBody(req);
  if (String(b.pin || '') !== STAFF_PIN) {
    return send(res, 401, { error: 'Falsche PIN.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO staff_sessions (token) VALUES (?)').run(token);
  send(res, 200, { ok: true }, {
    'Set-Cookie': `staff_sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`,
  });
});

route('POST', '/api/staff/logout', async (req, res) => {
  const sid = parseCookies(req).staff_sid;
  if (sid) db.prepare('DELETE FROM staff_sessions WHERE token = ?').run(sid);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'staff_sid=; HttpOnly; Path=/; Max-Age=0' });
});

// Live-Warteschlange für Mitarbeiter
route('GET', '/api/staff/queue', async (req, res) => {
  const day = today();
  const waiting = db.prepare(
    "SELECT * FROM entries WHERE day = ? AND status = 'waiting' ORDER BY number"
  ).all(day);
  const ready = db.prepare(
    "SELECT * FROM entries WHERE day = ? AND status = 'ready' ORDER BY ready_at"
  ).all(day);
  send(res, 200, {
    venue: venueName(),
    waiting: waiting.map(ticketView),
    ready: ready.map(ticketView),
    stats: queueStats(day),
  });
}, { staff: true });

// Mitarbeiter fügt manuell hinzu
route('POST', '/api/staff/add', async (req, res) => {
  const b = await readBody(req);
  const name = String(b.name || '').trim().slice(0, 60);
  const note = String(b.note || '').trim().slice(0, 200);
  const day = today();
  const next = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM entries WHERE day = ?').get(day).n;
  const info = db.prepare(
    "INSERT INTO entries (day, number, name, note, source) VALUES (?,?,?,?,'staff')"
  ).run(day, next, name, note);
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
  send(res, 200, { entry: ticketView(e) });
}, { staff: true });

// Status ändern: ready (aufrufen), done (abgeholt), waiting (zurückstellen), cancelled
route('POST', '/api/staff/entry/:id/status', async (req, res, _u, p) => {
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(p.id));
  if (!e) return send(res, 404, { error: 'Eintrag nicht gefunden.' });
  const b = await readBody(req);
  const s = String(b.status || '');
  if (!['waiting', 'ready', 'done', 'cancelled'].includes(s)) {
    return send(res, 400, { error: 'Ungueltiger Status.' });
  }
  const sets = ['status = ?'];
  const vals = [s];
  if (s === 'ready') { sets.push("ready_at = datetime('now')"); }
  if (s === 'done') { sets.push("done_at = datetime('now')"); }
  vals.push(e.id);
  db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(e.id);
  send(res, 200, { entry: ticketView(updated) });
}, { staff: true });

// Einstellungen (Lokalname)
route('POST', '/api/staff/settings', async (req, res) => {
  const b = await readBody(req);
  if (b.venue_name !== undefined) setSetting('venue_name', String(b.venue_name).trim().slice(0, 80));
  send(res, 200, { venue: venueName() });
}, { staff: true });

route('GET', '/api/settings', async (req, res) => {
  send(res, 200, { venue: venueName() });
});

// ---------- Server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
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
          if (r.staff && !isStaff(req)) {
            return send(res, 401, { error: 'Nicht autorisiert (Mitarbeiter-PIN erforderlich).' });
          }
          return await r.handler(req, res, null, params, url.searchParams);
        }
      }
      return send(res, 404, { error: 'Nicht gefunden.' });
    }

    // Freundliche URLs
    let file = pathname;
    if (file === '/') file = '/index.html';
    if (file === '/staff') file = '/staff.html';
    if (file === '/ticket') file = '/ticket.html';
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
    console.error(e);
    send(res, 500, { error: 'Serverfehler.' });
  }
});

server.listen(PORT, () => {
  console.log(`QueueUp laeuft: http://localhost:${PORT}`);
  console.log(`Mitarbeiter-Dashboard: http://localhost:${PORT}/staff (PIN: ${STAFF_PIN})`);
});
