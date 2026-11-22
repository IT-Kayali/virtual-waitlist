# Deployment und EU-Release-Pfad

Stand: 22.11.2026, Anwendung v0.7.0. Der unten belegte Produktiv-Release wurde
nach EU-only-Upload und Live-Counter-Test bestätigt. Die App läuft als einzelner Node-Prozess
mit SQLite und einem persistenten Volume auf Railway.

## Aktuelles Setup

| Teil | Wert |
|---|---|
| Workspace | My Projects, Limited Trial |
| Projekt | virtual-waitlist, `0e9d31ad-3186-41a7-a51e-1a152ac57d14` |
| Produktivdienst | virtual-waitlist, `9a34dba5-aeda-46f3-9d4d-4e831f4c28ff` |
| Umgebung | production |
| Laufzeitregion | EU West / Amsterdam, `europe-west4-drams3a`, eine Replik |
| URL | https://virtual-waitlist-production.up.railway.app |
| Persistenz | virtual-waitlist-volume, Mount `/data`, SQLite und Logos |
| Workspace-Standard | EU West / Amsterdam, gespeichert und nach Neuladen geprüft |

Kosten und Laufzeit werden im Railway-Konto geprüft. Es gibt keine Zusage für
dauerhaften kostenlosen Weiterbetrieb oder unbegrenzte Volume-Aufbewahrung.
Vor Karte, Upgrade oder Bezahlplan ist eine neue Freigabe erforderlich.
Die Billing-Seite zeigte beim Regionstest am 22.11. einen Limited Trial ohne
hinterlegte Zahlungsmethode. Das ist ein Prüfzeitpunkt, keine ewige Zusage.

## Vor jedem Produktiv-Deploy

1. Den richtigen Workspace, das Projekt, die Umgebung und die Service-ID
   prüfen. Ein lokaler Testkontext darf nie versehentlich Produktion treffen.
2. Im Workspace unter General die gespeicherte Preferred Deployment Region
   EU West / Amsterdam prüfen. Diese Vorgabe gilt für neue Dienste.
3. Die Service-Konfiguration muss **vor** dem Upload ausschließlich eine
   EU-West-Replik enthalten. Keine US- oder Asien-Replik darf aktiv sein.
4. CLI-Version und Release-Pfad mit dem unten belegten Test vergleichen.
   Bei geänderter CLI, geänderter Regionslogik oder widersprüchlicher
   Konfiguration zuerst wieder mit einem Wegwerf-Dienst und Dummy-Daten
   prüfen. Bis zum Nachweis bleibt der Produktiv-Deploy gesperrt.
5. Backup, Tests, aktuelles GitHub-Repo und aktualisierte Doku sicherstellen.
   Das [Pre-Pilot-Gate](PILOT-CHECKLIST.md) ist vor echten Gästen separat nötig.

**Nicht mehr verwenden:** erst `railway up`, danach die Region korrigieren.
Eine nachträgliche Verschiebung kann einen unerwünschten Zwischenbetrieb
und bei Volumes eine Migration auslösen. Ebenso keine neue Legacy-Datei
`railway.json` oder `railway.toml` für diesen Zweck hinzufügen.

## Geprüfter Ablauf für den bestehenden Dienst

Die Befehle setzen eine angemeldete Railway CLI voraus. Getestet wurde
Version 5.75.0. Vorher die oben genannten Prüfungen durchführen.

```bash
cd virtual-waitlist
railway link --project 0e9d31ad-3186-41a7-a51e-1a152ac57d14 --environment production --service 9a34dba5-aeda-46f3-9d4d-4e831f4c28ff --json
# Link-Ergebnis auf genau diese IDs prüfen, sonst abbrechen.
railway scale eu-west=1 us-west=0 us-east=0 southeast-asia=0 --json
# Ergebnis muss ausschließlich eine EU-West-Replik enthalten.
railway up --detach --json
railway deployment list --limit 2 --json
```

In der getesteten CLI wurde `--project` bei einem `scale`-Aufruf fehlerhaft
als Replikatzuweisung behandelt. Deshalb wird zuerst der genaue lokale
Kontext verknüpft; `scale` verwendet danach diesen geprüften Kontext.
Die Ausgabe ist zu prüfen, statt einen fehlgeschlagenen Schritt zu übergehen.

Bereits das Manifest des neu angelegten Deployments muss ausschließlich
`europe-west4-drams3a: {numReplicas: 1}` unter `multiRegionConfig` zeigen.
Danach SUCCESS, tatsächliche Instanz und Region, Logs, Volume-Zuordnung und
die öffentlichen Seiten/Settings prüfen. Bei einem anderen Regionsziel den
Rollout stoppen und untersuchen, nicht auf nachträgliches Verschieben bauen.

GitHub-Push und Produktiv-Deploy sind getrennte Schritte. Ein reiner
Dokumentationsabschluss braucht keinen zusätzlichen App-Neustart. Auto-Deploy
ist hier nicht als Ersatz für diese Regionsprüfung freigegeben.

## Letzter geprüfter Release: v0.7.0

Deployment `64808e8e-54c5-4f66-b093-b406781cfb86`, angelegt am 22.11.2026 um
20:23:30 CET, danach SUCCESS. Bereits INITIALIZING und der spätere Live-Stand
enthielten nur `europe-west4-drams3a` mit einer Replik. Workspace-Standard vorher
live EU West / Amsterdam; Limited Trial ohne hinterlegte Zahlungsmethode.
Bestehendes Volume `/data` wurde gemountet, Startlogs v0.7.0 ohne App-Stacktrace.

- 34/34 Tests auf Node 22.23.5, `npm audit --omit=dev`: keine bekannten Lücken.
- Lokales Chrome: QR-Ziel ohne Kundenfelder, Nummer/Code-Zuordnung, DE/EN/AR,
  iOS-Anleitung, neunstellige Nummer und bestätigtes Ready-Ticket. Keine
  JavaScript-Seitenfehler und keine Drittanbieter-Requests. Einseitigen 80-mm-
  Test-PDF-Beleg und mobile Layouts als echte Pixel geprüft, kein echter Drucker.
- Live nur eigenes Ticket 178 / Nummer 887001: Staff-Belegerzeugung mit QR,
  Nummer und Code; QR-Ziel geöffnet, Fragment entfernt, Browser-Besitzschlüssel
  lokal gesetzt. Der Testbrowser hat Push erneut verweigert, Blockiert-Zustand
  ist sichtbar. Daraus folgt kein neuer Gateway-/Handy-Erfolg.
- Eigenes Ticket über Staff auf bereit gesetzt, grünen Gaststatus geprüft.
  Tipp bestätigt serverseitig dieselbe Aufrufversion, ohne auf abgeholt zu
  wechseln. Manuelle Nummer-/Code-Eingabe im selben Browser öffnete dasselbe
  bereits verbundene Ticket erneut und behielt die Bestätigung.
- Danach eigenes Ticket verlassen, Zustand **cancelled** über die Staff-
  Berechtigung bestätigt. Andere Einträge unverändert. Unauthentifizierter
  Ticket-GET liefert 403. Seiten/Manifest/Worker/Settings 200; API `no-store`.
- Keine Karte, kein Upgrade, keine Aktivierung von Live-Zahlungen. Physische
  Android-Erinnerungsfolge, iPhone, echter Druck/Scan, Betreiber-/Rechts- und
  Restore-Abnahme bleiben getrennte Gates.

Die Crash-Mail um 20:23:54 verweist auf den ersetzten v0.6.0-Deploy
`3977746e-2fcf-4ddf-91a9-ae62f8697cc0`, nicht auf diesen Release. Dessen Logs
zeigen Container-Stopp 20:23:52 und npm SIGTERM 20:23:56 beim Wechsel.
Das belegt das Ablöse-Muster, nicht die interne Ursache der Railway-Einstufung.

## Vorheriger geprüfter Release: v0.6.0

Am 22.11.2026 gegen 19:43 CET war Deployment
`3977746e-2fcf-4ddf-91a9-ae62f8697cc0` SUCCESS. Workspace-Standard zuvor live
als EU West / Amsterdam bestätigt; Limited Trial ohne hinterlegte Karte.
Genau eine EU-West-Replik wurde vor dem Upload gesetzt. Schon das
INITIALIZING-Manifest enthielt ausschließlich `europe-west4-drams3a` mit
`numReplicas: 1`. Es gab keine nachträgliche Regionskorrektur.

- Startlogs: v0.6.0, bestehendes Volume, kein Anwendungs-Stacktrace.
- Live: Startseite, Demo-Settings, Staff-Seite, Manifest, Icons, Worker und
  Gäste-Datenschutz HTTP 200. API `no-store`, Worker/Manifest `no-cache`.
- Push-Konfiguration ist aktiviert und liefert nur den öffentlichen Schlüssel.
- Ein eigenes neues Gastticket wurde im Browser erstellt, Zugriffsschlüssel
  lokal vorhanden, Service Worker kontrolliert die Seite. Ohne Besitznachweis
  und ohne Personal-Session liefert dessen Ticket-API HTTP 403.
- Nur dieses eigene Testticket wurde im Personal-Dashboard auf bereit gesetzt.
  Bereit-Anzeige und mobiles Layout wurden live geprüft. Anschließend auch
  aus dem Bereit-Zustand abgemeldet; tatsächlicher Status `cancelled` über
  die angemeldete Personal-Sitzung bestätigt.
- Ein altes eigenes Testticket blieb erhalten; seine öffentliche Ansicht
  zeigte keinen Namen/Notiz und war nicht für Push freigeschaltet.
- Der Testbrowser lehnte beim ausdrücklichen Push-Versuch die Berechtigung
  ab. Die Seite zeigte den Blockiert-Hinweis; es entstand kein Abonnement.
  Daher keine echte APNs-/FCM-Zustellung und kein physischer Handytest belegt.
- Lokal: 27/27 Tests, npm audit ohne bekannte Schwachstelle am Prüfzeitpunkt.

Die Crash-Mail von 19:38:57 CET verweist auf das ersetzte v0.5.1-Deployment
`ed97010b-d59f-44ce-a414-86de11aeec34`. Dessen Ende zeigt Container-Stopp und
npm/SIGTERM, keinen App-Stacktrace. Der neue v0.6.0-Dienst ist SUCCESS.
Die genaue Railway-Klassifizierung dieses npm-Stopps ist damit nicht bewiesen.

Physische Push-Abnahme, Restore-Test und rechtliche Pilotfreigabe bleiben
offen. Nicht aus diesem technischen Release eine Zusage für alle Handys ableiten.

## Vorheriger gepruefter Release: v0.5.1

Am 22.11.2026 gegen 19:17 CET war Deployment
`ed97010b-d59f-44ce-a414-86de11aeec34` auf SUCCESS. Bereits beim Anlegen
enthielt sein Manifest nur eine EU-West-Replik. Die Startlogs zeigen v0.5.1
und keinen Anwendungsfehler. Startseite, Preise, Abo, Admin und die
Demo-Settings antworteten mit HTTP 200.

Der Ticket-Alarm wurde mit einem eigenen Demo-Testticket geprueft: Bereits
aufgerufenes Ticket nach Neuladen sichtbar, AudioContext nach ausdruecklichem
Tippen aktiv und wiederholender Alarm beim Wechsel von wartend zu bereit.
Die mobile Ansicht wurde visuell kontrolliert. Anschliessend wurde nur das
eigene Testticket abgemeldet. Ein realer Handy-Sperrbildschirm-/Hintergrundtest
ist damit nicht belegt; Details stehen in [NOTIFICATIONS.md](NOTIFICATIONS.md).

Die Crash-Mail von 19:10:56 CET verweist auf das abgeloeste Deployment
`90cf46de-4931-4570-a2d4-b1e5f6c6ec46` mit v0.5.0. Dessen letzte Logs zeigen
einen Container-Stopp und npm/SIGTERM, keinen Anwendungs-Stacktrace. Der alte
Release ist REMOVED. Das ist kein Beleg fuer einen aktuellen Ausfall; die
genaue Klassifizierung dieses Stopps durch Railway bleibt offen.

## Nachweis mit einem Wegwerf-Dienst

Am 22.11.2026 wurde ein neuer leerer Dienst mit reinem Dummy-Code angelegt.
Er hatte weder Datenbank noch Volume, Produktionsschlüssel oder echte
Gästedaten und erhielt keine öffentliche Domain.

- Workspace-Standard zuerst auf EU West gespeichert und nach Neuladen geprüft.
- Vor dem ersten Upload EU West = 1 gesetzt, andere Regionen entfernt.
- Erster Upload: Deployment `977c4a2e-9109-4d51-8e73-449cd760ce35`,
  EU-only bereits im INITIALIZING-Manifest, später SUCCESS.
  Der tatsächliche Prozessstart meldete `europe-west4-drams3a`.
- Zweiter Upload ohne nachträglichen Scale-Schritt: Deployment
  `f3ec3f90-88de-4e1f-806e-34846fa73168`, erneut EU-only bereits beim Anlegen,
  später SUCCESS und tatsächlicher Prozessstart in derselben EU-Region.
- Dummy-Dienst `f76788ef-4c14-41ec-8c7b-92266d51232d` direkt danach gelöscht.
  Die anschließende Live-Abfrage zeigte nur noch den ursprünglichen Dienst.
- Produktion wurde dabei nicht neu deployed und blieb auf Deployment
  `90cf46de-4931-4570-a2d4-b1e5f6c6ec46`, RUNNING in EU West.

Zusammenfassung der Messdaten: [test-results/eu-region-probe.json](test-results/eu-region-probe.json).
Der Test nutzte nur vorhandenes Trial-Guthaben. Der einzelne Verbrauch wurde
nicht separat gemessen. Es gab keine Karte, kein Upgrade und keinen Bezahlplan.

Der Nachweis gilt für diesen getesteten Pfad und Zeitpunkt. Er beweist weder
die genaue Ursache früherer Regionswechsel noch eine automatische Garantie
für jede künftige Railway-Version. Insbesondere ist die frühere pauschale
Aussage, jeder Upload setze immer auf US zurück, nicht belegt. EU-Laufzeit
allein ist außerdem keine Zusage, dass sämtliche Anbieter-Metadaten,
Build-Caches, Backups und Unterauftragnehmer ausschließlich in der EU liegen.

## Neue Installation

Vor dem ersten Upload Workspace-Standard und einen leeren Dienst auf EU West
setzen und prüfen. Das Volume für `/data` und die nötige Konfiguration
vorbereiten. Erst danach Code hochladen. Keine bereits befüllte
Produktionsdatenbank in einen ungeprüften Dienst kopieren.

Railway baut die Node-App mit Railpack und startet `npm start`. Benötigt
werden Node >= 22.13, `npm ci --omit=dev` sowie `DATA_DIR=/data`, eine eigene Demo-PIN in `STAFF_PIN`
und die Admin-Zugangsdaten `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Geheimnisse nur
über geeignete geheime Einstellungen setzen, nie in Git oder Ausgaben.
Provider-Schlüssel können später verschlüsselt im Admin hinterlegt werden.

## PWA-Rollout ab v0.6.0

Dieser Abschnitt beschreibt den Release-Pfad, keine vorweggenommene
Produktivabnahme. Der letzte bestätigte Live-Release steht weiter oben.

- Lockfile mit hochladen und Abhängigkeiten installieren. Die App verwendet
  jetzt `web-push`; ein Start ohne `npm ci` reicht nach frischem Checkout nicht.
- Genau eine EU-Replik beibehalten, Datenbank und Volume nicht ersetzen.
- `RAILWAY_PUBLIC_DOMAIN` ist auf diesem Dienst vorhanden und liefert die
  echte HTTPS-Adresse für VAPID. Es ist keine zusätzliche Secret-Eingabe nötig.
- Beim ersten Start wird vor der additiven Ticket-Migration eine geschützte
  lokale SQLite-Sicherung erstellt; Bestandstickets bleiben erhalten.
- Die neue `.push-identity.json` muss auf demselben persistenten Volume bleiben.
  Nicht ausgeben oder ins Repository kopieren. Backup/Restore mit Datenbank
  und beiden Anwendungsschlüsseldateien separat abnehmen.
- Nach Deploy: Version/Startlogs, EU-only-Manifest, Settings, Gastformular,
  geschütztes eigenes Ticket, Staff-Queue, PWA-Manifest/Icons/Worker und
  Abmeldung prüfen. Nur eigene Testtickets ändern.
- Alte öffentliche Ticketansichten liefern keinen Namen/Notiz mehr. Ihre
  Nummer/Status funktionieren weiter, Push nur mit neuem Browser-Besitznachweis.
- Echte Push-Zustellung und physische Handy-Signale bleiben ein eigenes Gate,
  siehe [WEB-PUSH.md](WEB-PUSH.md) und [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md).

## Counter-/Alarm-Rollout v0.7.0

Vor dem nächsten Upload: `npm test` und `npm audit`, lokales Chrome-Layout und
Druckbeleg prüfen. Der Stand enthält `qrcode` zusätzlich zu `web-push`; Lockfile
mit hochladen und `npm ci --omit=dev` verwenden. Bestehendes Volume/Schlüssel
beibehalten. Die additive Counter-Migration legt bei Bestand eine geschützte
`.pre-counter-migration.sqlite` an, deren Löschschwelle 48 Stunden beträgt.

Live prüfen: Staff-Anmeldung, nur Kassennummer erfassen, Beleg mit QR + Nummer +
Code, QR-Scan ohne Kundenfelder, manueller Nummer-/Code-Weg, Einmal-Besitzbindung,
Ticket/Ready/Bestätigung/Abmeldung, Datenschutz, API `no-store`, Manifest/Worker.
Nur eigene Testtickets verändern und danach entfernen. Das erste und finale
Manifest müssen vor/nach Start EU-only zeigen. Browser-Layouts und Mock-Tests
belegen keine neue physische Android-Alarmfolge.

## Betrieb und Abnahme

- Änderungen an Umgebungsvariablen können einen Deploy auslösen. Deshalb
  gilt die Regionsprüfung auch für solche Änderungen.
- Lokale Namen, Logos, Personal und Vorwarnschwelle werden im jeweiligen
  Geschäfts-Dashboard unter `/b/<slug>/staff` verwaltet.
- Backups müssen SQLite, Logos und die zur Entschlüsselung der
  Anbieter-Konfiguration benötigten Schlüssel sicher berücksichtigen.
- Billing bleibt ohne Schlüssel deaktiviert und zusätzlich gegen Live-Verkauf
  gesperrt. Einrichtung und echte Sandbox-Abnahme: [BILLING.md](BILLING.md).
- Vor echten Gästen: [PILOT-CHECKLIST.md](PILOT-CHECKLIST.md). Rechtstexte,
  Kontakt und iPhone-/Android-Test gehören in dieselbe Pilotfreigabe.
- Der begrenzte Lasttest ist in [LOAD-TEST.md](LOAD-TEST.md) dokumentiert.
  Er ist keine Kapazitäts- oder Dauerbetriebsgarantie.

## Quellen

- https://docs.railway.com/deployments/regions
- https://docs.railway.com/cli/scale
- https://docs.railway.com/deployments/scaling
- https://docs.railway.com/platform/advanced-concepts

Die Regionsdoku verweist teils auf Account Settings, der aktuelle Dialog
liegt unter Workspace > General. Die Live-Oberfläche wurde deshalb separat
geprüft. Frühere zeitlich mit Deploys zusammenfallende Crash-Meldungen belegen
für sich allein ebenfalls keine bestimmte Ursache.
