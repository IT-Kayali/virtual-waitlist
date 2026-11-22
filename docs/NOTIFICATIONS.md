# Ticket-Alarm und Hintergrund-Benachrichtigungen

Ab Codeversion v0.6.0 ist optionales PWA/Web Push beauftragt und implementiert.
Aktueller Produktivstand: [DEPLOYMENT.md](DEPLOYMENT.md). Einrichtung,
Besitznachweis, Datenschutz und verbleibende Abnahme: [WEB-PUSH.md](WEB-PUSH.md).
Die folgenden In-Page-Regeln gelten weiter, insbesondere für alte Tickets
und ohne aktivierten Push. Ab v0.7.0 kommen persönlicher Counter-Beleg mit QR
und Abholcode, höchstens drei geplante Push-Hinweise sowie versionsgebundene
Bestätigung hinzu. Android verwendet weiter seinen Systemton, keinen eigenen
Web-Push-Alarmton. Einzelheiten und Geräte-Grenzen stehen in WEB-PUSH.md.

## Gastablauf

1. Ticket öffnen und einmal **Ton aktivieren / testen** antippen.
2. Prüfen, ob der Testton hörbar ist. Geräte-Lautstärke, Stummmodus und
   Browserrechte können die Wiedergabe verhindern.
3. Ticket geöffnet lassen. Wenn es bereit ist, erscheint der grüne Hinweis.
   Nach erfolgreichem Aktivieren wird eine wiederholte Melodie abgespielt.
   Tippen oder eine Taste bestätigt den Fertig-Alarm und stoppt die Wiederholung.
4. Nach dem Wechsel in einen anderen Tab wird bei Rückkehr frisch abgefragt.
   Ein noch nicht bestätigter Bereit-Alarm wird dann wieder angeboten.
   Falls das Betriebssystem den Audiokontext angehalten hat, Ton erneut
   aktivieren. Ein bestätigter Alarm wird nicht dauernd neu abgespielt.

Browserhinweise sind optional und funktionieren nur soweit vom Browser
unterstützt. Ein sichtbarer Berechtigungsdialog oder eine erteilte Erlaubnis
beweist keine Hintergrund-Zustellung. Vibration ist geräteabhängig. Bei
unterbrochener Verbindung zeigt die Seite nun einen Hinweis und versucht
weiter, den aktuellen Status zu lesen.

## Reparierte Fehler

- Bereits beim ersten Laden bereite Tickets wurden vorher nur grün, ohne
  den Alarm auszulösen. Live mit einem eigenen Demo-Testticket reproduziert.
- Der Ton wurde zuvor aus dem Polling mit immer neuen, nicht durch eine
  Nutzeraktion entsperrten AudioContext-Instanzen gestartet. Jetzt wird ein
  wiederverwendbarer Kontext direkt beim Antippen aktiviert und getestet.
- Ein im Hintergrund verbrauchter Alarm durfte die spätere Anzeige bei
  Rückkehr nicht verhindern. Sichtbarkeit und Bestätigung sind jetzt getrennt.
- Manche mobilen Browser stellen Notification bereit, werfen aber beim
  Konstruktor einen Fehler. Dieser Fehler blockiert den Ticket-Pfad nicht mehr.
- Abgeholte oder stornierte Tickets beenden eine noch laufende Alarmwiederholung.
- Gleichzeitige Polls werden vermieden. Ein Sprachwechsel setzt die
  Bestätigung eines Alarms nicht mehr zurück.

Automatisierte Regressionen stehen in `tests/ticket.test.js`. Diese Tests
prüfen den Ablauf mit kontrollierten Browser-Objekten. Sie beweisen keinen
hörbaren Ton oder eine fühlbare Vibration auf einem echten iPhone/Android.
Die physische Geräte-Abnahme bleibt im [Pre-Pilot-Gate](PILOT-CHECKLIST.md) offen.

## Andere Wege und frühere Aufwandsschätzungen

Die Zeitangaben sind grobe technische Schätzungen ohne Anbieter-Freischaltung,
keine Lieferzusagen. Web Push wurde am 22.11. beauftragt; die anderen Wege
sind nicht beauftragt oder aktiviert. Neue Anbieter-/Kostenentscheidungen
brauchen eine eigene Freigabe.

| Weg | Grober Aufwand | Grenzen und Kosten |
|---|---|---|
| PWA + Web Push | 1-2 Arbeitstage inklusive Zustellablauf und Tests | Auf iPhone ab iOS 16.4 Home-Screen-Web-App und aktiv erteilte Erlaubnis. Kein Apple-Developer-Abo nötig. Serverbetrieb bleibt; Fokus-/Geräteeinstellungen können Signale stummschalten. |
| E-Mail | 2-4 Stunden Grundanbindung, zusätzlich DNS und Zustelltests | Gastadresse und passende Information/Einwilligung nötig. Kein Echtzeit-Pager, Spamfilter und Mail-Push-Einstellungen. Beispiel Resend Free: 100/Tag und 3.000/Monat. |
| SMS | 3-6 Stunden nach Anbieter-Einrichtung | Nummer, Versandfreigabe und Schutz vor Missbrauch nötig. Beispiel Twilio Deutschland: 0,112 USD je ausgehendem Segment, gegebenenfalls weitere Gebühren, Steuern und Senderkosten. |
| WhatsApp Business | Ähnlicher technischer Aufwand wie SMS, Freigaben können Tage dauern | Business-Onboarding und passende genehmigte Vorlage nötig. Beispiel Twilio: 0,005 USD je Nachricht plus Meta-Gebühren nach Land und Vorlage. |
| Personal-/Kiosk-Alarm | 1-2 Stunden plus Test | Keine Nachrichtengebühr. Vorhandenes Gerät offen/aktiv und Ton entsperrt. Erreicht nicht das gesperrte Gästehandy. |

Preise sind Anbieterbeispiele in deren Währung, keine Buchung oder
Endpreisgarantie. Vor einer Auswahl aktuelle Konditionen und die benötigte
Versand-/Datenschutzfreigabe prüfen. Zusätzliche Gastdaten nicht vorsorglich
sammeln.

## Quellen

- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://www.twilio.com/de-de/sms/pricing/de
- https://www.twilio.com/en-us/whatsapp/pricing
