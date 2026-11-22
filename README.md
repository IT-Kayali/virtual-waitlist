# QueueUp – Virtuelle Warteliste als SaaS für Cafés & Restaurants

Eine browserbasierte Warteschlange, die **physische Pager-Geräte ersetzt** – jetzt
als **Multi-Tenant-SaaS**: Beliebig viele Geschäfte (Cafés, Restaurants, Imbisse)
melden sich auf einer Plattform an. Jedes Geschäft bekommt seine eigene
Warteschlange, eigene QR-Codes, eigene Mitarbeiter-PINs und eigene Statistiken –
strikt getrennt von allen anderen.

**Live:** https://virtual-waitlist-production.up.railway.app
(Demo-Geschäft: `/b/demo`, Personal-Dashboard: `/b/demo/staff`, PIN im Tresor des Besitzers)

**Technik:** Node.js ≥ 22.13 mit eingebautem SQLite (`node:sqlite`) und
`web-push` für optionale Hintergrund-Benachrichtigungen. Installation: `npm ci`.
Der aktuelle Produktivstand steht in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

### Öffentliche Webseite (Marketing, Kontakt, Preise)

Die Startseite `/` ist eine professionelle öffentliche Webseite (Deutsch):
Produktpitch mit Live-Demo-Verweis, `/preise` (Abo-Modelle aus der Datenbank,
im Admin-Bereich pflegbar), `/kontakt` (Kontakt- und Anfrageformular –
Anfragen landen im Admin-Bereich), `/impressum` und `/datenschutz`
(Inhalte im Admin-Bereich pflegbar, Platzhalter bis zur finalen Angabe).
Registrierung und Login für Geschäfte liegen unter `/anmelden`.

### Für den Plattform-Betreiber (SaaS-Inhaber)

- Admin-Bereich unter **`/admin`** (Login mit E-Mail + Passwort aus den
  Umgebungsvariablen `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- Übersicht über **alle** registrierten Geschäfte mit Live-Zahlen:
  wartend/bereit/bedient heute, Tickets gesamt, Mitarbeiter, Logo,
  Registrierungsdatum.
- **Sperren/Entsperren** pro Geschäft: Ein gesperrtes Geschäft ist sofort
  komplett offline (Kundenseite, Ticket-APIs, Personal-Login; laufende
  Sessions werden beendet), bis es wieder entsperrt wird.
- **Anfragen** aus dem Kontaktformular: einsehen, filtern, Status setzen
  (neu/in Bearbeitung/erledigt), Badge für neue Anfragen.
- **Abo-Modelle** verwalten: anlegen/bearbeiten (Preis, Leistungen,
  Sortierung, „Beliebt“, Stripe-Price-ID, PayPal-Plan-ID), aktivieren/
  deaktivieren. Änderungen sind sofort auf `/preise` sichtbar.
- **Abos** einsehen (Geschäft, Tarif, Anbieter, Status, Laufzeit).
- **Webseiten-Inhalte** pflegen: Hero-Texte, Kontakt-E-Mail, Impressum,
  Stand der Datenschutzerklärung sowie Zahlungsanbieter-Einstellungen
  (Modus, Basisadresse, verschlüsselte Stripe-/PayPal-Schlüssel).

### Für Gäste

1. QR-Code scannen oder Link öffnen.
2. Nummer erhalten – die Ticket-Seite zeigt **Nummer, Wartende davor, gesamte
   Warteschlangen-Länge und geschätzte Wartezeit** und aktualisiert sich
   automatisch (alle 3 Sekunden).
3. **„Fast dran"-Benachrichtigung** (Ton + Vibration + Hinweis), sobald nur
   noch so viele Gäste davor sind, wie das Geschäft eingestellt hat.
4. Sobald die Bestellung fertig ist: sichtbarer grüner Hinweis. Nach bewusstem
   **Ton aktivieren / testen** wiederholte Melodie auf der offenen Seite.
   Ton und Vibration sind geräteabhängig, keine Garantie für gesperrte Handys.
5. Ab v0.6.0 optionaler Web-Push-Aufruf nach ausdrücklicher Erlaubnis. Auf
   iPhone/iPad zuerst die Home-Screen-Web-App öffnen, dann dort beitreten.
   Alte Tickets bleiben In-Page-Tickets. Details: [WEB-PUSH.md](docs/WEB-PUSH.md).
6. Kein Gästekonto. Lokaler Browser-Speicher hält Ticket, Zugriffsschlüssel
   und Sprache; bei Push kommt der jeweilige Browseranbieter als Transport hinzu.

Nummern starten pro Geschäft täglich neu. Die Wartezeit-Schätzung nutzt die
tatsächliche durchschnittliche Bedienzeit des Geschäfts an diesem Tag
(Fallback: 5 Min. pro Bestellung).

## Datenschutz (DSGVO)

- **Datenminimierung:** Name und Bestellnotiz sind freiwillig. Keine
  Gäste-Konten und kein Werbe-Tracking. Bei optionalem Push transportiert der
  Browseranbieter eine verschlüsselte Nachricht ohne Name/Bestellnotiz.
- **Automatische Löschung:** abgeschlossene/stornierte Tickets nach
  einem Alter von **24 Stunden**, alle Tickets ab **48 Stunden**,
  Personal-Sessions ab 12 Stunden (Löschlauf beim Start und stündlich).
  Push-Anmeldungen enden mit Ticket/Abmeldung, spätestens ab 48 Stunden
  im nächsten Push-Löschlauf.
- **Mandantentrennung:** jeder Datensatz gehört zu genau einem Geschäft
  (`business_id`); API-Zugriffe sind immer auf das eigene Geschäft beschränkt.
- **Transparenz:** Datenschutzerklärung pro Geschäft unter
  `/b/<slug>/privacy`, verlinkt auf allen Gäste-Seiten.
- **Hosting-Standort:** siehe [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Schnellstart lokal

```bash
npm ci
node server.js
# Startseite:                       http://localhost:3000
# Registrierung/Login:              http://localhost:3000/anmelden
# Demo-Geschäft:                    http://localhost:3000/b/demo
# Personal-Dashboard:               http://localhost:3000/b/demo/staff   (PIN: 0000)
```

Voraussetzung: **Node.js ≥ 22.13**. Beim ersten Start wird automatisch ein
Demo-Geschäft angelegt (Slug `demo`, PIN aus `STAFF_PIN`). Eine bestehende
Datenbank aus der Single-Tenant-Version (≤ 0.1.x) wird beim Start automatisch
in das Demo-Geschäft migriert; alte Links (`/ticket?id=…`) leiten sauber um.

## Abo-Anbindung (v0.5.0)

`/abo` ist der integrierte Abo-Bereich für Geschäftsinhaber. Stripe Hosted
Checkout und PayPal-Sandbox sind als Adapter vorbereitet, inklusive
signierter Webhooks, Anbieter-Statusprüfung, Duplikatschutz und bestätigter
sofortiger Kündigung. Standardmäßig sind Zahlungen deaktiviert.
Live-Verkauf ist zusätzlich im Code gesperrt. Die Tarife sind unverbindliche
Entwürfe, ohne tarifabhängige Feature-Sperrung.

Anbieter-Schlüssel können später direkt im Admin unter Webseiten-Inhalte
eingetragen werden, verschlüsselt und ohne Klartext-Rücklesung.

Einrichtung, benötigte Schlüssel, Grenzen und ausstehende Sandbox-Abnahme:
[docs/BILLING.md](docs/BILLING.md). Tests: `npm test`.

## Umgebungsvariablen

| Variable | Standard | Zweck |
|---|---|---|
| `PORT` | `3000` | HTTP-Port (auf Railway automatisch gesetzt) |
| `STAFF_PIN` | `0000` | Personal-PIN des **Demo-Geschäfts** (nur Erstsetup/Migration) – **immer setzen!** |
| `DATA_DIR` | `./data` | Verzeichnis für SQLite-Datei und Logos. Auf Railway: `/data` (Volume) |
| `ADMIN_EMAIL` | – | E-Mail des Plattform-Admins (`/admin`). Ohne diese Variablen ist der Admin-Bereich deaktiviert. |
| `PUBLIC_BASE_URL` | – | Echte HTTPS-Basisadresse für Push; auf Railway reicht alternativ `RAILWAY_PUBLIC_DOMAIN`. |
| `ADMIN_PASSWORD` | – | Passwort des Plattform-Admins – **immer setzen und geheim halten!** |

## Dokumentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – Live-Setup und belegter EU-Release-Pfad
- [docs/PILOT-CHECKLIST.md](docs/PILOT-CHECKLIST.md) – offenes Gate vor echten Gästen: Betreiberangaben und Handy-Benachrichtigungen
- [docs/API.md](docs/API.md) – REST-API-Referenz
- [docs/WEB-PUSH.md](docs/WEB-PUSH.md) – PWA, Opt-in, Besitznachweis, Zustelllogik und offene Geräteabnahme
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) – Ton aktivieren, Alarmgrenzen und weitere Optionen
- [docs/BILLING.md](docs/BILLING.md) – Abo-Zahlungen und Anbieter-Einrichtung
- [docs/LOAD-TEST.md](docs/LOAD-TEST.md) – gemessener Lasttest mit 10/50/100 parallelen Abläufen
- [CHANGELOG.md](CHANGELOG.md) – Änderungshistorie

## Sprachen

Gäste-Seiten (Beitritt, Kiosk, Ticket) und die Registrierung sind mehrsprachig:
**Englisch, Deutsch, Arabisch** (inkl. RTL). Umschalten auf der Seite oder per
`?lang=de|en|ar`. Neue Sprache = ein Eintrag in `public/i18n.js`.
Die öffentliche Marketing-Webseite ist Deutsch. Das Personal-Dashboard ist aktuell Englisch.

## Projektstruktur

```
push.js               Verschlüsselte Push-Anmeldungen, VAPID, persistente Outbox
public/pwa.js         PWA-Einrichtung und ausdrücklicher Push-Opt-in
public/sw.js          Push-Anzeige und sichere Ticket-Klickziele, kein API-Cache
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
public/admin.html     Plattform-Admin (/admin, SaaS-Inhaber)
public/admin.js
public/privacy.html   Datenschutzerklärung (/privacy, /b/<slug>/privacy)
public/privacy.js
public/i18n.js        Sprachdateien (EN/DE/AR)
public/styles.css
docs/                 Deployment- und API-Dokumentation
```

## Versionspflege und Releases

Codeänderungen werden zusammen mit der aktualisierten Doku in denselben
Commit gepusht. Produktiv-Releases erfolgen ausschließlich über den geprüften
EU-Pfad aus [DEPLOYMENT.md](docs/DEPLOYMENT.md). Reine Doku-Updates benötigen
keinen zusätzlichen App-Neustart. Vor dem ersten echten Gastbetrieb gilt
zusätzlich das [Pre-Pilot-Gate](docs/PILOT-CHECKLIST.md).
