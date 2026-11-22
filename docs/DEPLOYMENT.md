# Deployment und EU-Release-Pfad

Stand: 22.11.2026, Anwendung v0.5.0. Die App läuft als einzelner Node-Prozess
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
werden Node >= 22 sowie `DATA_DIR=/data`, eine eigene Demo-PIN in `STAFF_PIN`
und die Admin-Zugangsdaten `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Geheimnisse nur
über geeignete geheime Einstellungen setzen, nie in Git oder Ausgaben.
Provider-Schlüssel können später verschlüsselt im Admin hinterlegt werden.

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
