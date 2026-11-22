# Changelog

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
