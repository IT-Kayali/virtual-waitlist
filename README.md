# QueueUp – Virtuelle Warteliste als SaaS für Cafés & Restaurants

Eine browserbasierte Warteschlange, die **physische Pager-Geräte ersetzt** – jetzt
als **Multi-Tenant-SaaS**: Beliebig viele Geschäfte (Cafés, Restaurants, Imbisse)
melden sich auf einer Plattform an. Jedes Geschäft bekommt seine eigene
Warteschlange, eigene QR-Codes, eigene Mitarbeiter-PINs und eigene Statistiken –
strikt getrennt von allen anderen.

**Live:** https://virtual-waitlist-production.up.railway.app
(Demo-Geschäft: `/b/demo`, Personal-Dashboard: `/b/demo/staff`, PIN im Tresor des Besitzers)

**Null Abhängigkeiten:** reines Node.js ≥ 22 mit eingebautem SQLite
(`node:sqlite`). Kein `npm install` nötig.

## So funktioniert es

### Für Geschäfts-Inhaber

1. Auf der Startseite (`/`) Geschäft anlegen: Name, E-Mail, Passwort,
   Personal-PIN (4–8 Ziffern). Fertig – das Geschäft ist sofort live unter
   `/b/<slug>`.
2. Im Dashboard (Inhaber-Login = E-Mail + Passwort):
   - **Mitarbeiter verwalten**: jeder Mitarbeiter bekommt eine eigene PIN und
     kann sie später nicht mehr nutzen, sobald er entfernt wird.
   - **Mitarbeiter-Report**: Wer hat wie viele Bestellungen fertig gemeldet
     und abgeholt? Mit durchschnittlicher Zeit bis „fertig".
   - **Logo hochladen** (PNG/JPEG/WebP/SVG, max. 2 MB) – erscheint auf
     Gäste-Seite und Ticket.
   - **„Fast dran"-Schwelle** einstellen (Standard: 2).
   - Geschäfts-PIN ändern.
3. Zwei QR-Codes im Dashboard ausdrucken:
   - **Selbstbedienung** (`/b/<slug>`) – Gäste tragen ihre Bestellung selbst ein.
   - **Tresen/Kiosk** (`/b/<slug>/kiosk`) – der Kunde scannt nur, das Personal
     trägt die Bestellung auf dem Handy des Kunden ein.

### Für Mitarbeiter

- Login am Dashboard (`/b/<slug>/staff`) mit Geschäfts-PIN **oder** eigener
  Mitarbeiter-PIN. Mit Mitarbeiter-PIN werden „Ready"- und „Abgeholt"-Aktionen
  dem Mitarbeiter zugeordnet (Grundlage für den Report).
- Live-Ansicht der Warteschlange und Abholliste, **Ready 🔔** pro Eintrag,
  manuell Bestellungen hinzufügen (z. B. Telefon), Tages-Statistiken.

### Für Gäste

1. QR-Code scannen oder Link öffnen.
2. Nummer erhalten – die Ticket-Seite zeigt **Nummer, Wartende davor, gesamte
   Warteschlangen-Länge und geschätzte Wartezeit** und aktualisiert sich
   automatisch (alle 3 Sekunden).
3. **„Fast dran"-Benachrichtigung** (Ton + Vibration + Hinweis), sobald nur
   noch so viele Gäste davor sind, wie das Geschäft eingestellt hat.
4. Sobald die Bestellung fertig ist: **grüner Vollbild-Alarm** – laute,
   sich wiederholende Melodie (bis man tippt), Vibration, optional
   Browser-Benachrichtigung.
5. Keine App, keine Anmeldung, keine Cookies.

Nummern starten pro Geschäft täglich neu. Die Wartezeit-Schätzung nutzt die
tatsächliche durchschnittliche Bedienzeit des Geschäfts an diesem Tag
(Fallback: 5 Min. pro Bestellung).

## Datenschutz (DSGVO)

- **Datenminimierung:** Name und Bestellnotiz sind freiwillig. Keine
  Gäste-Konten, keine Cookies, kein Tracking, keine Weitergabe an Dritte.
- **Automatische Löschung:** abgeschlossene/stornierte Tickets nach
  **24 Stunden**, alle Tickets spätestens nach **48 Stunden**,
  Personal-Sessions nach 12 Stunden (läuft beim Start und stündlich).
- **Mandantentrennung:** jeder Datensatz gehört zu genau einem Geschäft
  (`business_id`); API-Zugriffe sind immer auf das eigene Geschäft beschränkt.
- **Transparenz:** Datenschutzerklärung pro Geschäft unter
  `/b/<slug>/privacy`, verlinkt auf allen Gäste-Seiten.
- **Hosting-Standort:** siehe [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Schnellstart lokal

```bash
node server.js
# Startseite (Registrierung/Login): http://localhost:3000
# Demo-Geschäft:                    http://localhost:3000/b/demo
# Personal-Dashboard:               http://localhost:3000/b/demo/staff   (PIN: 0000)
```

Voraussetzung: **Node.js 22+**. Beim ersten Start wird automatisch ein
Demo-Geschäft angelegt (Slug `demo`, PIN aus `STAFF_PIN`). Eine bestehende
Datenbank aus der Single-Tenant-Version (≤ 0.1.x) wird beim Start automatisch
in das Demo-Geschäft migriert; alte Links (`/ticket?id=…`) leiten sauber um.

## Umgebungsvariablen

| Variable | Standard | Zweck |
|---|---|---|
| `PORT` | `3000` | HTTP-Port (auf Railway automatisch gesetzt) |
| `STAFF_PIN` | `0000` | Personal-PIN des **Demo-Geschäfts** (nur Erstsetup/Migration) – **immer setzen!** |
| `DATA_DIR` | `./data` | Verzeichnis für SQLite-Datei und Logos. Auf Railway: `/data` (Volume) |

## Dokumentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – Live-Setup auf Railway, Update-Ablauf, Hosting-Standort
- [docs/API.md](docs/API.md) – REST-API-Referenz
- [CHANGELOG.md](CHANGELOG.md) – Änderungshistorie

## Sprachen

Gäste-Seiten (Beitritt, Kiosk, Ticket) und die Startseite sind mehrsprachig:
**Englisch, Deutsch, Arabisch** (inkl. RTL). Umschalten auf der Seite oder per
`?lang=de|en|ar`. Neue Sprache = ein Eintrag in `public/i18n.js`.
Das Personal-Dashboard ist aktuell Englisch.

## Projektstruktur

```
server.js             Backend: HTTP-Server, REST-API, SQLite-Schema, Migration, Löschjob
public/landing.html   SaaS-Startseite (Registrierung/Login)
public/landing.js
public/index.html     Gäste-Beitritt (Selbstbedienung, /b/<slug>)
public/join.js
public/kiosk.html     Tresen-Bildschirm (/b/<slug>/kiosk)
public/kiosk.js
public/ticket.html    Live-Ticket-Seite (/b/<slug>/ticket)
public/ticket.js
public/staff.html     Personal-Dashboard + Inhaber-Bereich (/b/<slug>/staff)
public/staff.js
public/privacy.html   Datenschutzerklärung (/privacy, /b/<slug>/privacy)
public/privacy.js
public/i18n.js        Sprachdateien (EN/DE/AR)
public/styles.css
docs/                 Deployment- und API-Dokumentation
```

## Arbeitsregel (stehend)

Jede Änderung wird **gemeinsam mit der aktualisierten Doku** in denselben
Commit gepusht und danach live ausgerollt. Das Repo ist damit jederzeit
direkt deploybar.
