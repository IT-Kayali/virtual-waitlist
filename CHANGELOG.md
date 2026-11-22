# Changelog

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
