# QueueUp – Virtuelle Warteliste für Cafés & Restaurants

Eine browserbasierte Warteschlange, die **physische Pager-Geräte ersetzt**.
Gäste reihen sich per Link oder QR-Code vom Handy aus ein, sehen ihre Nummer
live und werden benachrichtigt, sobald ihre Bestellung fertig ist. Das Personal
steuert alles über ein einfaches Dashboard. Keine App, keine Hardware, keine
Anmeldung für Gäste.

**Live-Demo:** https://virtual-waitlist-production.up.railway.app
(Personal-Dashboard: `/staff`, PIN im Tresor des Besitzers)

**Null Abhängigkeiten:** reines Node.js ≥ 22 mit eingebautem SQLite
(`node:sqlite`). Kein `npm install` nötig.

## So funktioniert es

**Gäste** (`/`)
1. QR-Code am Tresen scannen (oder Link öffnen).
2. Optional Name und Bestellnotiz eingeben → Ticket-Nummer erhalten.
3. Die Ticket-Seite zeigt Nummer, Wartende davor und geschätzte Wartezeit.
   Sie aktualisiert sich automatisch (alle 3 Sekunden).
4. Sobald das Personal die Bestellung auf „Ready" setzt: Bildschirm wird grün,
   Ton + Vibration, optional Browser-Benachrichtigung.
5. Gäste können die Warteschlange jederzeit verlassen.

**Personal** (`/staff`, PIN-geschützt)
- Live-Ansicht der Warteschlange und der Abholliste (Auto-Refresh).
- **Ready 🔔** pro Eintrag → benachrichtigt den Gast sofort.
- Abgeholt / Zurück in die Warteschlange / Stornieren.
- Bestellungen manuell hinzufügen (z. B. Telefonbestellungen).
- Statistiken: wartend / bereit / heute bedient / Ø Minuten.
- Druckbarer QR-Code für die Gäste-Seite + Beitritts-URL.
- Name des Lokals konfigurierbar.

Nummern starten täglich neu. Die Wartezeit-Schätzung nutzt die tatsächliche
durchschnittliche Bedienzeit des Tages (Fallback: 5 Min. pro Bestellung).

## Schnellstart lokal

```bash
node server.js
# Gäste:   http://localhost:3000
# Personal: http://localhost:3000/staff   (PIN: 0000)
```

Voraussetzung: **Node.js 22+**. PIN und Port per Umgebungsvariable:

```bash
STAFF_PIN=1234 PORT=8080 node server.js
```

## Umgebungsvariablen

| Variable | Standard | Zweck |
|---|---|---|
| `PORT` | `3000` | HTTP-Port (auf Railway automatisch gesetzt) |
| `STAFF_PIN` | `0000` | PIN fürs Personal-Dashboard – **immer setzen!** |
| `DATA_DIR` | `./data` | Verzeichnis der SQLite-Datei. Auf Railway: `/data` (Volume) |

## Dokumentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – Live-Setup auf Railway, Update-Ablauf, Alternativen
- [docs/API.md](docs/API.md) – REST-API-Referenz
- [CHANGELOG.md](CHANGELOG.md) – Änderungshistorie

## Sprachen

Die Gäste-Seiten sind mehrsprachig: **Englisch, Deutsch, Arabisch** (inkl.
RTL). Umschalten auf der Seite oder per `?lang=de|en|ar`. Neue Sprache = ein
Eintrag in `public/i18n.js`. Das Personal-Dashboard ist aktuell Englisch.

## Projektstruktur

```
server.js            Backend: HTTP-Server, REST-API, SQLite-Schema
public/index.html    Gäste-Beitrittsseite
public/join.js
public/ticket.html   Live-Ticket-Seite für Gäste
public/ticket.js
public/staff.html    Personal-Dashboard
public/staff.js
public/i18n.js       UI-Texte (en/de/ar)
public/styles.css    Responsive Styles
data/                SQLite-Datenbank (lokal; auf Railway im Volume /data)
docs/                Ausführliche Doku
```

## Regel für Änderungen

Jede Änderung wird **mit Doku-Update in einem Commit** auf GitHub gepusht,
damit das Repo jederzeit deploybar bleibt. Danach live aktualisieren mit
`railway up` (Details: docs/DEPLOYMENT.md).

## Roadmap-Ideen

- SMS/WhatsApp-Benachrichtigung (z. B. Twilio) für Gäste, die die Seite schließen
- Mehrere Stationen / Tresen
- Kitchen-Display-Modus
- WebSockets statt Polling
- Multi-Tenant (mehrere Lokale auf einer Instanz)
