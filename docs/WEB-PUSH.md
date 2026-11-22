# Counter-Abholbeleg, PWA und Web Push

Stand: 22.11.2026, Code v0.7.1. Letzter separat bestätigter Produktivstand:
[DEPLOYMENT.md](DEPLOYMENT.md). Der Nutzer hat die echte Android-Zustellung von
v0.6.0 bestätigt. Die neue Erinnerungsfolge ist noch kein physisch abgenommener
Android-Alarm. iPhone-Gerätetest und rechtliche Pilotfreigabe bleiben offen.

## Counter und Kunde

1. Personal meldet sich unter `/b/<slug>/staff` an. `/b/<slug>/kiosk` zeigt
   ebenfalls diese geschützte Personal-Oberfläche, nicht mehr das alte Formular
   auf dem Kundenhandy.
2. Nur die tatsächlich vergebene Kassennummer eingeben, 1 bis 999999999.
   Nummern sind pro Geschäft und UTC-Kalendertag eindeutig. Führende Nullen
   werden numerisch behandelt. Es werden keine Kundennamen oder Bestellnotizen
   abgefragt. Bereits vergebene Nummern nicht nochmals anlegen, sondern
   **QR / Beleg** am vorhandenen Eintrag wählen.
3. QueueUp erzeugt einen eigenen druckbaren Abholbeleg mit **QR und Abholnummer
   gleichzeitig**, ohne zusätzlichen Abholcode. Es gibt keine Anbindung an ein POS-System oder
   einen bestimmten Bondrucker. Browser-Druckdialog und Druckerformat prüfen.
4. Der Kunde scannt den persönlichen QR. Die Seite zeigt seine Nummer, ohne
   weitere Dateneingabe. Alternativ auf `/b/<slug>/` nur die Abholnummer vom
   heutigen Beleg eingeben. Der allgemeine Dashboard-QR öffnet nur
   diese manuelle Eingabe und vermittelt keinen Ticketbesitz.
5. Nach Prüfung bietet ein großer Knopf Mitteilungen an. Der vorbereitete
   `PushManager.subscribe`-Aufruf beginnt direkt in diesem Tipp, vor jedem
   Netzwerk-`await`. Ein bloßer QR-Seitenaufruf erzwingt keinen nativen Dialog.
   Ohne Mitteilungen oder bei blockiertem Push ist das Ticket weiter nutzbar.
6. Installation wird als Option angeboten. Der echte Browser-Dialog erscheint
   nur bei verfügbarem `beforeinstallprompt` beziehungsweise `navigator.install`.
   Keine Website kann das Angebot erzwingen. Auf iPhone/iPad zuerst ab
   iOS/iPadOS 16.4 die Home-Screen-App installieren und öffnen, dort nur die
   Abholnummer eingeben. Wer vorher in Safari fortfährt, bindet das Ticket an Safari;
   Browser und Home-Screen-App teilen den lokalen Besitznachweis eventuell nicht.

Der zusätzliche Abholcode wurde auf ausdrücklichen Nutzerwunsch entfernt.
Die Nummer ist **kein geheimer Besitznachweis**: Wer eine aktive Nummer kennt
oder errät, kann sie vor dem Gast zuerst verbinden. Nach der ersten Verbindung
bleibt der Zugriff an diesen Browser gebunden. Manuell wird ausschließlich die
eindeutige Nummer des aktuellen UTC-Kalendertags im gewählten Geschäft gesucht,
nicht die womöglich gleiche Nummer von gestern. Ein persönlicher QR identifiziert
dagegen das konkrete Ticket bis zu dessen Ende, höchstens 48 Stunden. Sein
256-Bit-HMAC-Wert und bereits ausgegebene QR bleiben unverändert. Höchstens
300 Prüf-/Zuordnungsversuche je Geschäft und Minute.

## Besitznachweis und Bestand

- QR-Bild und allgemeiner QR entstehen lokal mit `qrcode` 1.5.4. Kein
  Besitzlink geht an einen externen QR-Dienst.
- Der QR-Wert steht im URL-Fragment, nicht im Server-Pfad oder Query. Die
  Kundenseite entfernt das Fragment sofort aus der sichtbaren URL. Danach
  erfolgt die Prüfung als gleich-originiger JSON-Request mit `no-store`.
- Einmal zugeordnet, verlangt das Ticket einen eigenen zufälligen 32-Byte-
  Browser-Schlüssel. Nur dessen SHA-256-Hash liegt in SQLite. Der Beleg kann
  nicht still auf einen zweiten Browser übertragen werden. Derselbe Schlüssel
  erlaubt eine sichere Wiederholung nach unterbrochener HTTP-Antwort.
- Neue unverbundene Counter-Tickets sind auch vor der Zuordnung nicht öffentlich
  lesbar oder stornierbar. Personal desselben Geschäfts behält Zugriff.
- Der alte öffentliche `POST /join` gibt HTTP 410 zurück. Bereits gespeicherte
  Tickets und PINs bleiben erhalten. Alte ungeschützte Tickets zeigen öffentlich
  nur Nummer/Status/Wartedaten, keine Namen/Notizen, und erlauben kein neues Push.
  Ihre alte Abmelde-Kompatibilität ist kein rückwirkender Besitznachweis.
- Browser-Schlüssel liegen im lokalen Speicher. Ein unterbrochener Claim hält
  einen Wiederholschlüssel mit 48-Stunden-Ablauf, dessen Rest beim nächsten
  Öffnen des Geschäfts entfernt wird. Ticket-Schlüssel werden nach erkanntem
  Ende/Verlassen entfernt; ohne erneutes Öffnen kann lokaler Speicher bleiben.
- Reihenfolge und Position richten sich nach Erfassung, nicht nach dem Zahlenwert
  einer fremd vergebenen Kassennummer. Die Wartezeit bleibt eine Schätzung.
- SVG-Logos erhalten eine Sandbox-CSP ohne Scripts oder externe Ressourcen,
  auch bei direktem Öffnen. Normale Bildanzeige bleibt möglich.

## Aufruf und begrenzte Erinnerungen

- Beim neuen Ready-Status entstehen versionierte, dauerhafte Outbox-Aufträge.
  Wiederholtes Setzen desselben Ready-Status ist kein neuer Aufruf. Zurück auf
  wartend und erneut bereit erzeugt eine neue Version.
- Pro Version sind ein Aufruf und zwei Erinnerungen geplant. Nach erfolgreicher
  Gateway-Annahme folgt der nächste frühestens nach 30 Sekunden. Keine endlose
  Schleife und keine Service-Worker-Timer für Dauertöne.
- Der Worker fragt hohe Web-Push-Urgency, `tag`, `renotify:true`,
  `requireInteraction:true` und ein Vibrationsmuster best-effort an.
  Android ignoriert `requireInteraction`; individuelle Vibrationsmuster sind
  ab Android 8 eingeschränkt. Ein eigener Web-Push-Sound und ein eigener nativer
  Android-Kanal sind nicht verfügbar. Ruhemodus wird nicht umgangen.
- Öffnen oder Wegwischen der Mitteilung sowie Tippen auf das bereite Ticket
  sendet eine auf die Aufrufversion begrenzte Bestätigung. Sobald sie den Server
  erreicht, werden weitere Jobs entfernt. Das Ticket bleibt **bereit**, nicht
  **abgeholt**. Ein alter Bestätigungsschlüssel kann keinen neuen Aufruf beenden.
- Der Payload enthält nur Nummer, Sprache, technische Ticket-/Aufrufdaten und
  einen ausschließlich für diese Bestätigung gültigen HMAC. Kein Gastname,
  keine Bestellnotiz, kein Browser-Besitzschlüssel. Klickziele bleiben same-origin.
- Eine kleine lokale IndexedDB merkt Sequenzen für 48 Stunden und dämpft
  doppelte Alarme auch nach Wegwischen/Neustart. Alte Einträge werden beim
  nächsten Push-Ereignis entfernt. Ohne verfügbaren lokalen Speicher ist die
  Deduplizierung nur best-effort. Exakt-einmalige Zustellung ist nicht garantiert.
- Bestätigungen können offline scheitern. Bereits angenommene Nachrichten sind
  nicht rückrufbar. Deshalb steht der Aufruftext in der Vergangenheit, und
  verspätete/fehlerhafte Payloads zeigen nur einen generischen, stillen Hinweis.
  Jeder Push zeigt etwas Sichtbares; Safari erlaubt keine stillen Daten-Pushes.
- Der In-Page-Ton bleibt separat. Einmal **Ton aktivieren / testen** antippen.
  Die offene Seite kann eine Melodie wiederholen; das ist kein garantierter
  Sperrbildschirm-Alarm. Der Fast-dran-Hinweis bleibt ein In-Page-Hinweis.

### Android am echten Gerät

In den Mitteilungseinstellungen **Benachrichtigen/Alerting** statt Lautlos und,
falls vorhanden, **Pop-up/Pop on screen** wählen. Gewünschten Mitteilungston und
Mitteilungslautstärke am Handy einstellen. Menüs unterscheiden sich nach
Hersteller und Android-Version. QueueUp kann diese Einstellungen weder selbst
setzen noch einen Alarmton oder eine Lautstärke garantieren.

## Betrieb, Speicherung und Grenzen

Node >= 22.13, `npm ci --omit=dev`, eingechecktes Lockfile. Abhängigkeiten:
`web-push` 4.0.0 und `qrcode` 1.5.4. HTTPS-Basis in `PUBLIC_BASE_URL` oder
`RAILWAY_PUBLIC_DOMAIN`; sonst bleibt Push deaktiviert. Kein neuer kostenpflichtiger
Versanddienst, kein Apple-Developer-Abo. Hosting-/Trial-Grenzen gelten weiter.

- Genau ein Worker alle zwei Sekunden, höchstens 20 fällige Jobs je Lauf.
- Höchstens drei Endpunkte je Ticket; Adressen/Schlüssel AES-256-GCM-verschlüsselt.
- Vor jedem Versand Prüfung von Geschäft, Ticket, Ready-Version, Bestätigung,
  Status und Ablauf. Outbox überlebt Neustarts.
- Job-Gültigkeit fünf Minuten; Provider-TTL höchstens 60 Sekunden. Pro Phase
  höchstens vier Zustellversuche, übliche Backoffs 5/20/60 Sekunden. Numerisches
  Retry-After bei 429, Entfernen bei 404/410. Andere permanente 4xx enden.
- Nur geprüfte HTTPS-Endpunkte von Apple/Google/Mozilla/Microsoft, keine freien
  Hosts, Spezialports, Credentials oder Redirects; P-256-Schlüsselprüfung.
- VAPID pro Anbieter-Origin eine Stunde wiederverwendet und verschlüsselt.
- Keine Endpunkte, Schlüssel, Payloads oder Provider-Antworttexte in Logs.
- Ticketende, Abmeldung, Geschäftssperre oder 48-Stunden-Ablauf entfernen Push.
  Tickets: abgeschlossen/storniert ab 24 Stunden, sonst ab 48 Stunden im
  Start-/Stundenlauf. Keine pauschale Löschzusage für Hosting-Backups oder Logs.
- Vor additiven Push-/Counter-Migrationen liegt bei Bestand jeweils eine lokale
  geschützte SQLite-Sicherung an. Diese wird ab 48 Stunden im nächsten Worker-
  Löschlauf entfernt. Kein Ersatz für eine geprüfte externe Wiederherstellung.

`/data/.push-identity.json`, Modus 0600, enthält VAPID- und Verschlüsselungsidentität
und dient auch zur Ableitung der Beleg-/Bestätigungsschlüssel. Niemals ausgeben,
veröffentlichen oder ins Repository aufnehmen. Datenbank, Logos und beide
Anwendungsschlüsseldateien zusammen sichern. Verlust/Wechsel macht vorhandene
Belegcodes/QRs und Push-Anmeldungen unbrauchbar. Restore muss separat abgenommen
werden. Der Service Worker hat keinen Fetch-Handler oder Offline-API-Cache.

EU West für QueueUp begrenzt nicht jeden Browseranbieter, dessen Metadaten oder
Unterauftragnehmer auf die EU. Betreiberangaben, Rechtsgrundlagen, Vereinbarungen
und die rechtliche Freigabe bleiben offen. Keine pauschale DSGVO-Zusage.

## Prüfung

`npm test`: HTTP-Routen, Counter-Nummer/Code/QR, Fremd-Browser-/Mandanten-Sperren,
Bestandsdaten, native Gesture-Reihenfolge, Verschlüsselung, Neustart, begrenzte
Erinnerungen, versionsgebundene Bestätigung, Worker-Klickziele, Billing-Regressionen.
Keine echten Push-Requests aus Tests. Lokaler Chrome prüft echte UI, DE/AR/EN,
iOS-Anleitung, Druckbeleg und IndexedDB-Sequenzverhalten. Das sind keine Tests
auf einem physischen Telefon. Siehe [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md).

## Quellen

- https://web.dev/articles/push-notifications-display-a-notification
- https://web.dev/articles/push-notifications-notification-behaviour
- https://developer.chrome.com/blog/notification-requireInteraction
- https://developer.chrome.com/docs/modern-web-guidance/guides/pwa/install-web-app
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission
- https://notifications.spec.whatwg.org/
- https://support.google.com/android/answer/9079661
- https://support.google.com/android/answer/9082609
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
- https://github.com/web-push-libs/web-push/
