# API-Referenz

Basis-URL lokal: `http://localhost:3000`, live: `https://virtual-waitlist-production.up.railway.app`.
Alle Antworten sind JSON. `<slug>` ist der URL-Slug eines Geschäfts (z. B. `demo`).

**Rollen:** Gast (keine Anmeldung) · Personal (Cookie `staff_sid` nach PIN-Login,
an genau ein Geschäft gebunden) · Inhaber (E-Mail + Passwort, `kind=owner`).

## Plattform

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/signup` | Geschäft anlegen. Body: `{"venue_name","email","password","pin"}` (Passwort ≥ 6 Zeichen, PIN 4–8 Ziffern). Antwort: `{"slug","name"}` + Inhaber-Session. |
| POST | `/api/login` | Inhaber-Login. Body: `{"email","password"}`. |
| POST | `/api/logout` | Session beenden. |
| GET | `/api/me` | Aktuelle Session: `{"slug","name","email","kind","employee"}`. `kind`: `pin` \| `owner` \| `employee`. |

## Gäste (pro Geschäft)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/b/:slug/settings` | Öffentliche Daten: `{"venue","slug","has_logo"}`. |
| GET | `/api/b/:slug/logo` | Logo-Datei (404 wenn keins). PNG/JPEG/WebP/SVG. |
| POST | `/api/b/:slug/join` | Gast reiht sich ein. Body: `{"name","note","source"}` (alle optional; `source`: `guest` \| `counter` für den Tresen-Bildschirm). |
| GET | `/api/b/:slug/ticket/:id` | Ticket-Status (Polling). |
| POST | `/api/b/:slug/ticket/:id/cancel` | Warteschlange verlassen (nur solange `waiting`). |

## Personal (Session an Geschäft gebunden)

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/b/:slug/staff/login` | Body: `{"pin"}` – **Geschäfts-PIN oder Mitarbeiter-PIN**. Antwort enthält `kind` (`pin`/`employee`). |
| POST | `/api/staff/logout` | Session beenden. |
| GET | `/api/staff/queue` | Live-Warteschlange: `{"venue","slug","kind","employee","has_logo","notify_ahead","waiting":[...],"ready":[...],"stats":{"waiting","ready","served","avg_minutes"}}`. |
| POST | `/api/staff/add` | Manuell hinzufügen. Body: `{"name","note"}` (`source=staff`). |
| POST | `/api/staff/entry/:id/status` | Status setzen: `ready` \| `done` \| `waiting` \| `cancelled`. Bei Mitarbeiter-Session werden `ready_by`/`done_by` gesetzt. |
| POST | `/api/staff/settings` | `{"venue_name"}` (alle Rollen); `{"new_pin"}` und `{"notify_ahead": 0-20}` **nur Inhaber**. |
| POST | `/api/staff/logo` | Logo hochladen. Body: `{"data":"data:image/png;base64,..."}`, max. 2 MB, PNG/JPEG/WebP/SVG. |
| POST | `/api/staff/logo/remove` | Logo entfernen. |

## Plattform-Admin (SaaS-Inhaber, Zugang via `ADMIN_EMAIL`/`ADMIN_PASSWORD`)

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/admin/login` | Body: `{"email","password"}`. Setzt Cookie `admin_sid`. 403 wenn nicht konfiguriert. |
| POST | `/api/admin/logout` | Admin-Session beenden. |
| GET | `/api/admin/overview` | Alle Geschäfte mit Live-Zahlen: `{"count","businesses":[{"id","slug","name","email","active","created_at","has_logo","notify_ahead","employees","waiting","ready","served_today","tickets_total"}]}`. |
| POST | `/api/admin/business/:id/active` | Sperren/Entsperren. Body: `{"active": true|false}`. Beim Sperren werden alle Sessions des Geschäfts gelöscht; Kunden- und Personal-Endpunkte liefern danach 404. |

Seite: `/admin` (deutsch).

## Inhaber: Mitarbeiter & Reports

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/staff/employees` | Mitarbeiterliste: `{"employees":[{"id","name","active","created_at"}]}`. |
| POST | `/api/staff/employees` | Anlegen. Body: `{"name","pin"}` (PIN 4–8 Ziffern). |
| POST | `/api/staff/employees/:id/remove` | Deaktivieren; dessen Sessions werden sofort gelöscht. |
| GET | `/api/staff/reports` | Tages-Report: `{"day","employees":[{"id","name","ready_count","done_count","avg_ready_min"}],"unattributed_ready"}`. `unattributed_ready` = fertig gemeldet ohne Mitarbeiter-Login (Geschäfts-PIN). |

## Ticket-Objekt

```json
{
  "id": 1, "number": 1, "name": "Alex", "note": "2 Cappuccino",
  "status": "waiting", "source": "guest",
  "created_at": "2026-11-22 00:13:09", "ready_at": null,
  "ahead": 0, "waiting_total": 3, "notify_ahead": 2,
  "est_minutes": 5, "venue": "QueueUp Café", "slug": "demo"
}
```

- `number` läuft **pro Geschäft und Tag** von 1 hoch.
- `ahead` = wartende Tickets mit kleinerer Nummer; `waiting_total` = alle Wartenden.
- `notify_ahead` = „Fast dran"-Schwelle des Geschäfts.
- `est_minutes` = `ahead` × tatsächliche Ø-Bedienzeit des Tages (Fallback 5 Min.).
- `source`: `guest` (selbst eingereiht) \| `counter` (Tresen/Kiosk) \| `staff` (manuell).

## Seiten

| Pfad | Inhalt |
|---|---|
| `/` | SaaS-Startseite: Registrierung, Inhaber-Login, Demo-Link |
| `/b/<slug>` | Gäste-Beitritt (Selbstbedienung) |
| `/b/<slug>/kiosk` | Tresen-Bildschirm (Personal trägt Bestellung ein) |
| `/b/<slug>/ticket?id=…` | Live-Ticket |
| `/b/<slug>/staff` | Personal-Dashboard + Inhaber-Bereich |
| `/privacy`, `/b/<slug>/privacy` | Datenschutzerklärung |
| `/admin` | Plattform-Admin (SaaS-Inhaber) |
| `/ticket?id=…` (alt) | 302-Umleitung auf `/b/<slug>/ticket?id=…` |
| `/staff` (alt) | 302-Umleitung auf `/` |

## Datenmodell (SQLite)

- `businesses`: id, slug (unique), name, email (unique), pass_hash+salt,
  pin_hash+pin_salt, logo_ext, notify_ahead (Default 2), active (Sperrung), created_at.
- `admin_sessions`: token, created_at (Plattform-Admin, 12 h).
- `employees`: id, business_id, name, pin_hash+pin_salt, active, created_at.
- `sessions`: token, business_id, kind (`pin`|`owner`|`employee`), employee_id, created_at.
- `entries`: id, business_id, day, number, name, note, status, source,
  created_at, ready_at, done_at, ready_by, done_by. Unique: (business_id, day, number).

Alle Passwörter/PINs werden mit scrypt + Zufalls-Salt gehasht.
Gäste-Daten werden automatisch gelöscht (siehe README, DSGVO).

## Migration von 0.1.x

Beim Start erkennt der Server eine alte Single-Tenant-Datenbank
(`entries` ohne `business_id`) und migriert sie automatisch in ein
Demo-Geschäft (Slug `demo`, Name aus der alten `settings`-Tabelle, PIN aus
`STAFF_PIN`). Alte Ticket-Links leiten per 302 um.
