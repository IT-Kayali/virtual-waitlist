# Changelog

## 0.5.0 - 22.11.2026

- Live-Lasttest abgeschlossen: 960 Requests bei 10/50/100 parallelen
  Abläufen, null Fehler, p95 324/549/619 ms. Umfang und Grenzen sowie
  Rohdaten in `docs/LOAD-TEST.md` und `docs/test-results/load-test.json`.
- Zahlungs-Konfiguration im Live-Admin visuell geprüft, ohne Schlüssel
  gespeichert und nach Neuladen als deaktiviert bestätigt. Desktop-Billing
  und mobile Startseite visuell geprüft. Echte Anbieter-Sandbox noch offen.
- Veraltete pauschale Aussagen zu kostenlosem Railway-Weiterbetrieb und
  dauerhafter Volume-Aufbewahrung aus der Betriebsdoku entfernt.

- Anbieter-Einstellungen direkt im Admin: AES-GCM-verschlüsselt gespeichert,
  nur Maskierung/letzte Zeichen zurücklesbar, gezieltes Ersetzen/Löschen.
- Integrierter Bereich `/abo` und Link im Inhaber-Dashboard; Tarifwahl bleibt
  beim Login erhalten. Stripe Hosted Checkout und PayPal-Sandbox-Adapter.
- Standardmäßig deaktiviert, Live-Verkauf zusätzlich im Code gesperrt.
  Kein Publishable Key nötig. Konfiguration und noch ausstehende echte
  Sandbox-Abnahme ausführlich in `docs/BILLING.md` dokumentiert.
- Signierte Webhooks, Replay-Deduplizierung, erneute Anbieterabfrage,
  monatlicher Preisabgleich, DB-Duplikatschutz und bestätigte Kündigung.
- Neue Tabellen `billing_orders` und `billing_events`; Inhaberrechte auf
  allen Billing-APIs, Rate-Limits für Anbieterabfragen, JSON-/Origin-Prüfung.
- Unbestätigte Preise als Tarifentwürfe gekennzeichnet, erfundene
  Kontaktadresse/Supportzusagen und pauschale DSGVO-Werbung entfernt.
  Impressum und Datenschutz ausdrücklich noch Entwürfe.
- Queue-/Aufbewahrungsindizes ergänzt und geordneten Prozessstopp beim
  Deploy eingeführt. Moderates Lasttest-Skript mit 10/50/100 parallelen
  Abläufen, 3-Sekunden-Polling und Sicherheits-Abbruchgrenzen.
- `npm test`: zehn automatisierte Anbieter-/HTTP-Tests grün;
  bisherige Mandanten-/Migrationsregression ebenfalls grün.


## 0.4.0 – 22.11.2026

**Professionelle öffentliche Webseite + Anfragen- und Abo-Verwaltung im Admin-Bereich.**

- Neue öffentliche Seiten (Deutsch): `/` (Startseite mit Produktpitch,
  Live-Demo-Verweis und Funktionsübersicht), `/preise` (Abo-Modelle aus der
  Datenbank), `/kontakt` (Kontakt-/Anfrageformular mit Anliegen-Typ),
  `/impressum` und `/datenschutz` (DSGVO, Platzhalter bis zur finalen Angabe).
- Registrierung/Login für Geschäfte jetzt unter `/anmelden` (die alte
  `/staff`-Umleitung zeigt dorthin).
- Kontaktanfragen landen in der neuen `inquiries`-Tabelle und im
  Admin-Bereich: einsehen, filtern, Status (neu/in Bearbeitung/erledigt),
  Antwort-Link per E-Mail, Badge für neue Anfragen.
- Admin-Bereich mit Tabs: Geschäfte, Anfragen, Abo-Modelle (anlegen,
  bearbeiten, aktivieren/deaktivieren, „Beliebt“, Stripe-Price-ID,
  PayPal-Plan-ID), Abos, Webseiten-Inhalte (Hero, Kontakt-E-Mail, Impressum,
  Datenschutz-Stand) und Status der Zahlungsanbieter-Konfiguration.
- Neue Tabellen: `inquiries`, `plans` (mit Standard-Tarifen Starter 0 €,
  Pro 19 €, Business 49 € – änderbar), `site_content`, `subscriptions`
  (für die Bezahl-Integration vorbereitet).
- Öffentliche APIs: `POST /api/public/inquiry`, `GET /api/public/plans`,
  `GET /api/public/content`. Stripe-/PayPal-Checkout folgt in 0.5.0
  (Umgebungsvariablen siehe `/api/admin/config`).

## 0.3.0 – 22.11.2026

**Plattform-Admin (SaaS-Inhaber-Bereich).**

- Neue Seite `/admin`: Login mit E-Mail + Passwort aus den Umgebungsvariablen
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` (ohne diese ist der Bereich deaktiviert).
- Übersicht über **alle** Geschäfte mit Live-Zahlen (heute wartend/bereit/
  bedient, Tickets gesamt, Mitarbeiter, Logo, Registrierungsdatum) plus
  Direktlinks zu Kundenseite und Dashboard.
- **Sperren/Entsperren** pro Geschäft: gesperrt = Kundenseite, Ticket-APIs,
  Personal-Login und alle laufenden Sessions sofort deaktiviert (404),
  Daten bleiben erhalten; Entsperren stellt alles wieder her.
- Technik: `businesses.active`, eigene `admin_sessions`-Tabelle (12 h,
  wird vom Löschjob mit aufgeräumt), Admin-Routen strikt getrennt von
  Geschäfts-Sessions.
- Getestet: Login (falsch/richtig/unkonfiguriert), Auth-Zwang, Sperren
  (Kunde + Personal blockiert), Entsperren (alles wieder da).

Betriebshinweis: Bei früheren Uploads wurde ein Rückfall auf us-west2 beobachtet; nach jedem Deploy `railway scale us-west2=0 eu-west=1` erneut anwenden (in DEPLOYMENT.md dokumentiert).

## 0.2.0 – 22.11.2026

**QueueUp wird ein Multi-Tenant-SaaS.** Beliebig viele Geschäfte auf einer
Plattform, jedes mit eigener Warteschlange, eigenen QR-Codes, eigenem Personal
und eigenen Statistiken – strikt voneinander getrennt (`business_id` überall,
serverseitig erzwungen und getestet).

**Neu für Geschäfte**
- Registrierung (Name, E-Mail, Passwort, eigene Personal-PIN) und Inhaber-Login
  auf der neuen Startseite (`/`, EN/DE/AR).
- Eigenes URL-Kürzel: `/b/<slug>` (Gäste), `/b/<slug>/staff` (Dashboard).
- Inhaber-Bereich: Mitarbeiter mit **individuellen PINs** anlegen/entfernen
  (entfernte PINs sind sofort ungültig), **Mitarbeiter-Report** (fertig
  gemeldet / abgeholt / Ø-Zeit pro Mitarbeiter), Geschäfts-PIN ändern,
  „Fast dran"-Schwelle einstellen.
- **Logo-Upload** (max. 2 MB, PNG/JPEG/WebP/SVG) – erscheint auf Gäste-Seite
  und Ticket.
- Zwei druckbare QR-Codes im Dashboard: Selbstbedienung und Tresen/Kiosk.

**Neu für Gäste**
- **Tresen-Bildschirm** (`/b/<slug>/kiosk`): Kunde scannt nur, das Personal
  trägt die Bestellung auf dem Handy des Kunden ein.
- Ticket zeigt zusätzlich die **gesamte Warteschlangen-Länge**.
- **„Fast dran"-Alarm** (eigener Ton + Vibration + Hinweis), sobald nur noch
  die eingestellte Anzahl Gäste davor ist (Standard: 2).
- **Lauterer Fertig-Alarm**: sich wiederholende Melodie bis zum ersten Tippen,
  stärkere Vibration, Vollbild-Blitzen, Browser-Benachrichtigung bleibt
  bestehen.

**DSGVO**
- Datenminimierung (Name/Notiz freiwillig, keine Cookies, kein Tracking).
- **Automatische Löschung**: fertige/stornierte Tickets nach 24 h, alle nach
  48 h, Personal-Sessions nach 12 h (beim Start + stündlich).
- Datenschutzerklärung pro Geschäft unter `/b/<slug>/privacy`, verlinkt auf
  allen Gäste-Seiten.

**Migration & Kompatibilität**
- Bestehende 0.1.x-Datenbank wird beim Start automatisch in das Demo-Geschäft
  (`/b/demo`, bisherige `STAFF_PIN`, bisheriger Lokalname) migriert.
- Alte Links `/ticket?id=…` leiten per 302 auf das richtige Geschäft um;
  `/staff` leitet auf die Startseite.

**Getestet lokal:** Registrierung, Slug-Vergabe, Mandantentrennung (Tickets,
Personal-Aktionen, Logos), Mitarbeiter-Login/-Report/-Entfernung,
PIN-Auswirkungen, Kiosk-Beitritt, Logo-Limits, Migration 0.1.x → SaaS,
Löschjob, Neustart-Stabilität.

## 0.1.0 – 22.11.2026

Erste funktionierende Version (MVP).

- Gäste: Beitritt per Link/QR-Code (Name + Bestellnotiz optional, keine Anmeldung),
  Live-Ticket mit Nummer, Position, Wartezeit-Schätzung, Auto-Refresh,
  Ready-Alarm (grüner Vollbildschirm, Ton, Vibration, Browser-Benachrichtigung),
  Warteschlange verlassen, Sprachumschalter EN/DE/AR (RTL).
- Personal: PIN-geschütztes Dashboard (`STAFF_PIN`), Live-Warteschlange,
  Ready/Abgeholt/Zurück/Stornieren, manuell hinzufügen, Statistiken,
  Lokalname konfigurierbar, druckbarer QR-Code.
- Technik: Zero-Dependency Node.js 22 + eingebautes SQLite (`node:sqlite`),
  Tages-Nummerierung, Wartezeit aus tatsächlicher Ø-Bedienzeit.
- Deployment: live auf Railway mit persistentem Volume (`/data`),
  URL https://virtual-waitlist-production.up.railway.app
- Sicherheit: alle Personal-Endpunkte ohne PIN-Session → 401 (getestet).
