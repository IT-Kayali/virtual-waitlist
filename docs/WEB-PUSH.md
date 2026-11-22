# PWA und Web Push ab v0.6.0

Stand: 22.11.2026. Technische Umsetzung im Code, echte iPhone-/Android-Abnahme
noch offen. Ob diese Version bereits produktiv läuft, steht in
[DEPLOYMENT.md](DEPLOYMENT.md), nicht in einer lokalen Testmeldung.

## Gastablauf

1. Auf iPhone/iPad vor dem Einreihen im Teilen-Menü **Zum Home-Bildschirm**
   wählen und QueueUp über das neue Symbol öffnen. Ab iOS/iPadOS 16.4.
   Safari und die installierte Web-App teilen bestehende Tickets eventuell
   nicht. Ein laufendes Ticket deshalb nicht versehentlich doppelt anlegen.
2. In dieser Web-App beziehungsweise einem unterstützten Android-/Desktop-
   Browser ein neues Ticket erstellen. Es bekommt einen zufälligen,
   browserseitigen Zugriffsschlüssel, den der Server nur gehasht speichert.
3. Auf dem Ticket **Push für dieses Ticket aktivieren** antippen und im
   Browser erlauben. Es gibt keinen automatischen Berechtigungsdialog.
   Der direkte subscribe-Aufruf bleibt in dieser Nutzeraktion.
4. Bei einem neuen Aufruf durch das Personal wird eine Standard-
   Systembenachrichtigung angeboten. Sie öffnet nur das passende Ticket
   derselben Website. Der Text steht bewusst in der Vergangenheit: Eine
   angenommene Nachricht kann nach Abholung nicht zurückgerufen werden.
5. **Push für dieses Ticket ausschalten** entfernt nur diese serverseitige
   Anmeldung. Andere Geschäfte/Tickets auf demselben Browser bleiben
   unberührt. Browser-Erlaubnis gegebenenfalls in den Einstellungen widerrufen.

Der wiederholte Ton der geöffneten Seite bleibt separat: einmal **Ton
aktivieren / testen** antippen. Web Push liefert keine eigene Dauermelodie
auf den Sperrbildschirm. Ton, Vibration, Fokus, Stummmodus, Verbindung und
Energiesparen liegen beim Gerät. Keine Zustell- oder Lautstärkegarantie.
Der Fast-dran-Hinweis bleibt in v0.6.0 ein In-Page-Hinweis, kein zweiter Push.

## Besitznachweis und alte Tickets

- Neue Gäste-/Kiosk-Oberflächen erzeugen 32 zufällige Bytes. Der Schlüssel
  bleibt im lokalen Browser-Speicher und wird im Header `X-Ticket-Token`
  gesendet, nicht im Link oder Push-Payload.
- Neue, so geschützte Tickets verlangen ihn auch zum Lesen/Abmelden.
  Personal desselben Geschäfts kann weiterhin seine eigenen Einträge sehen.
- Ältere Tickets oder ältere API-Clients ohne Schlüssel bleiben für den
  bisherigen Nummer-/Status-Ablauf nutzbar, erhalten aber kein Push-Opt-in.
  Ihre öffentlichen Ansichten geben Name und Bestellnotiz nicht mehr aus.
- Eine Ticketnummer ist kein Besitznachweis. Es gibt deshalb keinen
  automatischen Anspruch auf ein altes Ticket nur anhand eines Links.
- Ein getrenntes Gerät hat den Schlüssel nicht. Beim nächsten Besuch ein
  neues Ticket verwenden, nicht während eines laufenden Besuchs duplizieren.
- Die alte Abmelde-API für ungeschützte Tickets bleibt bis zu deren Ablauf
  kompatibel. Sie ist kein nachträglich abgesicherter Besitznachweis.
  Vor einem echten Pilot nur aktuelle Oberflächen/API-Clients einsetzen.

## Server und Schlüssel

Node >= 22.13 und `npm ci --omit=dev`. Die zuvor dependency-freie Anwendung
verwendet jetzt `web-push` 4.0.0 mit eingechecktem Lockfile. Keine eigene
Implementierung des Web-Push-Verschlüsselungsprotokolls.

Push braucht eine echte HTTPS-Basisadresse in `PUBLIC_BASE_URL` oder die
von Railway bereitgestellte `RAILWAY_PUBLIC_DOMAIN`. Ohne diese Konfiguration
ist das Opt-in im Server deaktiviert. Lokal bleibt In-Page-Testen möglich.
Es wird kein kostenpflichtiger Versanddienst und kein Apple-Developer-Abo
angelegt. Bestehende Hosting-/Trial-Grenzen gelten unverändert.

Beim ersten Start wird `/data/.push-identity.json` mit Dateimodus 0600 erzeugt:
VAPID-Identität und Schlüssel zur Verschlüsselung der Abonnements. Niemals
anzeigen, ausgeben, ins Repository aufnehmen oder über eine HTTP-Route
bereitstellen. Bei Wiederherstellung gehören Datenbank und diese Datei
zusammen. Ein Verlust/Wechsel macht neue Gäste-Opt-ins nötig. Zur bestehenden
Billing-Schlüsseldatei kommt diese zweite geschützte Datei hinzu.

Vor der additiven Ticket-Schema-Migration wird bei vorhandenen Tickets lokal
auf dem Volume `.pre-push-migration.sqlite` erstellt. Sie bleibt geschützt,
wird nicht ausgeliefert und ab 48 Stunden im nächsten Push-Löschlauf entfernt.
Das ist kein geprüfter externer Backup-/Restore-Dienst. Das Pilot-Gate für
Wiederherstellung und Betreiberfreigabe bleibt offen.

## Zustellablauf

- Pro Ticket maximal drei Endpunkte. Endpunkt und Schlüssel liegen
  AES-256-GCM-verschlüsselt in SQLite; ein Hash dient zum Wiedererkennen.
- Der neue Ready-Status und sein Outbox-Auftrag werden in einer Transaktion
  gespeichert. Wiederholtes Setzen desselben Ready-Status erzeugt keinen
  neuen Aufruf. Zurück auf wartend und danach bereit ist ein neuer Aufruf.
- Der einzelne Arbeiter prüft alle zwei Sekunden, höchstens 20 fällige
  Aufträge pro Lauf, ohne parallele Arbeiter. Outbox überlebt einen Neustart.
- Vor Versand: Geschäft aktiv, passendes Ticket/Geschäft, weiterhin ready,
  aktuelle Aufrufversion und noch gültiger Auftrag. Ticketende, Abmeldung,
  Sperre oder Ablauf entfernen die jeweilige Anmeldung/ausstehenden Aufträge.
- Aufträge sind fünf Minuten gültig. Am Browserdienst wird höchstens eine
  Minute TTL angefragt. Temporäre Fehler werden begrenzt wiederholt
  (typisch 5/20/60 Sekunden, maximal vier Versuche). 429 berücksichtigt einen
  numerischen Retry-After, 404/410 löschen die Anmeldung. Keine Endlosschleife.
- Nur HTTPS-Endpunkte bekannter Apple-/Google-/Mozilla-/Microsoft-Pushdienste
  werden akzeptiert. Keine beliebigen Hosts, Credentials, Spezialports oder
  Weiterleitungen. Schlüssel werden auf Format und gültigen P-256-Punkt geprüft.
- VAPID-Autorisierung wird pro Anbieter-Origin eine Stunde wiederverwendet,
  verschlüsselt gespeichert und nicht für jede Nachricht neu erzeugt.
- Keine Endpunkte, Schlüssel, Provider-Antworttexte oder Payloads in Logs.
  Eine angenommene Gateway-Anfrage ist kein Beleg für ein klingelndes Handy.
- Bei Netzfehlern ist ein mehrfach angenommener Versand nicht völlig
  auszuschließen. Stabile Notification-Tags und `renotify:false` begrenzen
  doppelte Hinweise. Kein Anspruch auf exakt-einmalige Zustellung.

Der Service Worker hat bewusst keinen Fetch-Handler und keinen Offline-
API-Cache. Jede empfangene Push-Nachricht zeigt einen sichtbaren Hinweis,
auch bei verspäteten/fehlerhaften Daten, weil Safari stille Pushes untersagt.
Notification-Klicks dürfen keine fremden URLs öffnen. Im Payload stehen
Nummer, Aufrufversion, Sprache und Ticketroute, nicht Name, Notiz oder
Browser-Zugriffsschlüssel.

## Datenschutz und Grenzen

Push braucht Transport durch den jeweiligen Browseranbieter. EU West für
den Anwendungsserver ist keine Zusage, dass Apple/Google/Mozilla/Microsoft
oder alle Metadaten ausschließlich in der EU verarbeitet werden. Die
Gästehinweise beschreiben dies; Verantwortlichkeiten, Rechtsgrundlagen,
Auftragsverarbeitung und Kontaktangaben bleiben Teil der offenen rechtlichen
Pilotprüfung. Keine pauschale DSGVO-Konformitätszusage.

Nicht automatisch nachweisbar: reales iOS-Home-Screen-Installieren, echte
APNs-/FCM-Zustellung, gesperrtes Handy, fühlbare Vibration oder hörbarer Ton.
Die Abnahme muss physisch erfolgen, siehe [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md).

## Technischer Nachweis

- `tests/push.test.js`: Validierung/SSRF-Grenzen, Besitznachweis,
  Mandantenbindung, Verschlüsselung, Neustart, Aufruf-Deduplizierung,
  VAPID-Wiederverwendung, Wiederholungen, Abmeldung und 410-Bereinigung.
- `tests/push-http.test.js`: echte lokale HTTP-Routen, Manifest/Icons,
  Zugriffsschutz, Fremd-Origin-Sperre, Opt-in/Status/Opt-out, Ready-Abmeldung
  und datensparsame alte Ticketansicht. Kein realer externer Versand.
- `tests/pwa-client.test.js`: kein Prompt beim Laden, sofortiger
  gesture-gebundener Subscribe-Aufruf, iOS-/Legacy-/Blockiert-Zustände.
- `tests/service-worker.test.js`: sichtbare Hinweise und sichere Klickziele,
  keine Fetch-/Cache-Abhängigkeit.
- Bestehende Ticket-Alarm-/Billing-Regressionen bleiben Teil von `npm test`.
- Lokaler echter Chrome: Gastformular -> geschütztes Ticket -> Ready,
  keine JavaScript-Seitenfehler und kein Berechtigungsdialog beim Laden.
  Mobile DE/AR und iOS-Hinweis wurden als Layout geprüft, kein Gerätetest.
  Die vereinfachte Gäste-Datenschutzseite behält ihren Geschäfts-Rücklink;
  ihre DE/EN-Inhalte bleiben auch bei arabischer Navigation links-nach-rechts.

## Quellen

- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
- https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- https://github.com/web-push-libs/web-push/
