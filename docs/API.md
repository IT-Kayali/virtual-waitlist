# API-Referenz

Basis-URL lokal: `http://localhost:3000`, live: `https://virtual-waitlist-production.up.railway.app`.
Alle Antworten sind JSON. Gäste-Endpunkte brauchen keine Anmeldung;
Personal-Endpunkte brauchen eine Staff-Session (Cookie `staff_sid` nach PIN-Login).

## Gäste

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/join` | Gast reiht sich ein. Body: `{"name": "...", "note": "..."}` (beide optional). Antwort: `{"ticket": {...}}` mit `id`, `number`, `status`, `ahead`, `est_minutes`, `venue`. |
| GET | `/api/ticket/:id` | Ticket-Status (für Polling). Antwort: `{"ticket": {...}}`. Status: `waiting` \| `ready` \| `done` \| `cancelled`. |
| POST | `/api/ticket/:id/cancel` | Gast verlässt die Warteschlange (nur solange `waiting`). |
| GET | `/api/settings` | Öffentliche Einstellungen: `{"venue": "..."}`. |

## Personal

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/staff/login` | Body: `{"pin": "..."}`. Setzt Session-Cookie. |
| POST | `/api/staff/logout` | Session beenden. |
| GET | `/api/staff/queue` | Live-Warteschlange: `{"venue", "waiting": [...], "ready": [...], "stats": {"waiting", "ready", "served", "avg_minutes"}}`. |
| POST | `/api/staff/add` | Manuell hinzufügen. Body: `{"name": "...", "note": "..."}`. |
| POST | `/api/staff/entry/:id/status` | Status setzen. Body: `{"status": "ready"\|"done"\|"waiting"\|"cancelled"}`. `ready` setzt `ready_at` und löst beim Gast den Alarm aus. |
| POST | `/api/staff/settings` | Body: `{"venue_name": "..."}`. |

## Ticket-Objekt

```json
{
  "id": 1,
  "number": 1,
  "name": "Alex",
  "note": "2 Cappuccino",
  "status": "waiting",
  "created_at": "2026-11-22 00:13:09",
  "ready_at": null,
  "ahead": 0,
  "est_minutes": 5,
  "venue": "QueueUp Café"
}
```

- `number` läuft pro Tag von 1 hoch (Unique pro Tag).
- `ahead` = wartende Tickets mit kleinerer Nummer.
- `est_minutes` = `ahead` × tatsächliche Ø-Bedienzeit des Tages (Fallback 5 Min.).

## Datenmodell (SQLite)

- `entries`: id, day, number, name, note, status, source (`guest`|`staff`),
  created_at, ready_at, done_at. Unique: (day, number).
- `settings`: key/value (z. B. `venue_name`).
- `staff_sessions`: token, created_at.
