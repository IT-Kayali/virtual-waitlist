# QueueUp – Virtual Waitlist for Cafés & Restaurants

A web-based virtual queue that **replaces physical restaurant pager devices**.
Guests join the queue from their phone browser via a link or QR code, see their
live number, and get notified the moment their order is ready. Staff manage
everything from a simple dashboard. No app install, no hardware, no signup for
guests.

**Zero dependencies:** plain Node.js ≥ 22 with the built-in SQLite
(`node:sqlite`). No `npm install` needed.

## How it works

**Guest side** (`/`)
1. Guest scans the QR code at the counter (or opens the link).
2. Enters an optional name and order note → gets a ticket number.
3. The ticket page shows the number, how many people are ahead, and the
   estimated wait. It updates automatically (polling every 3 s).
4. When staff marks the order ready, the page turns green, plays a sound,
   vibrates, and (optionally) sends a browser notification.
5. Guest can leave the queue at any time.

**Staff side** (`/staff`, PIN-protected)
- Live view of the waiting queue and the ready-for-pickup list (auto-refresh).
- **Ready 🔔** button per entry → notifies that guest instantly.
- Mark picked up, move back to queue, or cancel entries.
- Add orders manually (e.g. phone orders).
- Stats: waiting / ready / served today / average minutes per order.
- Printable QR code for the join page, plus the join URL.
- Configurable venue name.

Numbers reset daily. The wait estimate uses today's actual average service
time (fallback: 5 min per order).

## Quick start

```bash
node server.js
# Guest page:        http://localhost:3000
# Staff dashboard:   http://localhost:3000/staff   (PIN: 0000)
```

Requires **Node.js 22+**. Set the staff PIN via environment variable:

```bash
STAFF_PIN=1234 PORT=8080 node server.js
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `STAFF_PIN` | `0000` | PIN for the staff dashboard |
| `DATA_DIR` | `./data` | Where the SQLite file lives |

## Deployment

Single Node process, no external services.

- **Any VPS:** clone the repo, run `node server.js` (e.g. via systemd or pm2).
- **Render / Railway / Fly.io:** start command `node server.js`, Node 22+,
  set `STAFF_PIN` as an env var, and mount a persistent volume at `data/` so
  the SQLite database survives redeploys.
- Put it behind HTTPS (Caddy/nginx or the platform's TLS) so browser
  notifications and vibration work reliably on phones.

## Languages

The guest-facing pages are i18n-ready and ship with **English, German, and
Arabic** (RTL included). Language is switchable on the page or via
`?lang=de|en|ar`. Adding a language = one entry in `public/i18n.js`.
The staff dashboard is English for now.

## Project structure

```
server.js            Backend: HTTP server, REST API, SQLite schema
public/index.html    Guest join page
public/join.js
public/ticket.html   Guest live ticket page
public/ticket.js
public/staff.html    Staff dashboard
public/staff.js
public/i18n.js       UI strings (en/de/ar)
public/styles.css    Responsive styles
data/                SQLite database (created on first start)
```

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/join` | Guest joins the queue |
| GET  | `/api/ticket/:id` | Ticket status (position, ETA, status) |
| POST | `/api/ticket/:id/cancel` | Guest leaves the queue |
| POST | `/api/staff/login` | Staff PIN login (cookie session) |
| POST | `/api/staff/logout` | Staff logout |
| GET  | `/api/staff/queue` | Live queue + stats (staff) |
| POST | `/api/staff/add` | Add entry manually (staff) |
| POST | `/api/staff/entry/:id/status` | `ready` / `done` / `waiting` / `cancelled` (staff) |
| GET/POST | `/api/settings`, `/api/staff/settings` | Venue name |

## Roadmap ideas

- SMS/WhatsApp notification when ready (e.g. Twilio) for guests who close the page
- Multiple counters / stations
- Kitchen display mode
- WebSockets instead of polling
- Multi-tenant mode (several venues on one instance)
