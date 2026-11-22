# Freigabe vor dem ersten echten Piloten

Stand: 22.11.2026. Status: **nicht freigegeben**.

Diese Liste wird unmittelbar vor dem ersten Betrieb mit echten Gästen oder
einem öffentlichen Launch geprüft. Eine technische Demo, ein grüner Lasttest
oder eine funktionierende Registrierung ersetzen diese Freigabe nicht.
Die folgenden Prüfungen wurden noch nicht als Pilotabnahme durchgeführt.

## Betreiber, Kontakt und Datenschutz

- [ ] Der Betreiber hat seine tatsächlichen Angaben unter `/admin` im Bereich
  Webseiten-Inhalte eingetragen.
- [ ] `/impressum` enthält keine Platzhalter mehr. Name/Firma, ladungsfähige
  Anschrift, Kontakt und gegebenenfalls weitere erforderliche Angaben wurden
  vom Betreiber auf Richtigkeit und Vollständigkeit geprüft.
- [ ] `/datenschutz` enthält keine offenen Betreiber-/Kontaktangaben mehr und
  beschreibt die tatsächlichen Datenflüsse. Das Kontaktformular unter
  `/kontakt` nimmt bereits Anfragen an und muss dabei berücksichtigt werden.
- [ ] Die veröffentlichten Kontaktangaben sind erreichbar. Der Betreiber kann
  neue Anfragen im Admin sehen und hat festgelegt, wer sie bearbeitet.
- [ ] Verantwortlichkeiten zwischen Plattform und teilnehmendem Geschäft,
  Aufbewahrung, Löschung und erforderliche Vereinbarungen mit Dienstleistern
  wurden geprüft. Diese Liste ist keine rechtliche Abnahme.
- [ ] Die tatsächliche Laufzeitregion und das Datenbank-Volume wurden aktuell
  als EU West / Amsterdam bestätigt. Der EU-gepinnte Release-Pfad wurde vor
  dem nächsten Produktiv-Deploy mit Dummy-Daten geprüft, siehe
  [DEPLOYMENT.md](DEPLOYMENT.md).

## Benachrichtigungstest am Tresen

Mit mindestens einem echten iPhone und einem echten Android-Handy testen.
Gerät, Betriebssystem, Browser, Version, Datum und Testergebnis festhalten.
Eine Browser-Simulation ist hierfür kein Ersatz.

| Gerät / Browser | Ticket im Vordergrund | Gerät gesperrt | Ergebnis / Einschränkung |
|---|---|---|---|
| iPhone / tatsächlich verwendeter Browser | offen | offen | noch nicht getestet |
| Android / tatsächlich verwendeter Browser | offen | offen | noch nicht getestet |

Für jede Kombination:

1. Als Gast über den echten QR-Code beitreten und das Ticket öffnen. Alle
   notwendigen Nutzeraktionen für Ton oder Berechtigungen bewusst ausführen.
2. Über das Personal-Gerät die Warteschlange so ändern, dass zuerst die
   "Fast dran"-Schwelle erreicht wird, dann das Ticket auf "bereit" setzen.
3. Im Vordergrund prüfen: aktualisierte Position/Status, sichtbarer Hinweis,
   akustisches Signal nach erlaubter Nutzerinteraktion, Vibration soweit
   vom Gerät unterstützt. Stummmodus und blockierte Berechtigungen separat
   notieren. Keine Vibration auf jedem Gerät voraussetzen.
4. Den Ablauf mit einem neuen Ticket bei gesperrtem Handy wiederholen.
   Festhalten, ob und wann überhaupt ein Signal ankommt und wann der Status
   nach dem Entsperren aktualisiert wird. Hintergrund-Tabs bei Bedarf als
   weitere eigene Testbedingung erfassen.
5. Verhalten beim kurzen Verbindungsabbruch und nach erneutem Öffnen prüfen.
   Stornierte oder abgeholte Tickets dürfen nicht weiter als wartend erscheinen.

**Keine Zusage für Sperrbildschirm oder Hintergrundbetrieb.** Das aktuelle
Browser-Ticket ist kein garantierter Push-Pager. Betriebssystem, Browser,
Energiesparen, Berechtigungen und Nutzeraktionen können Signale verhindern.
Ein zufällig erfolgreicher Einzeltest begründet keine allgemeine Zusage.

- [ ] Die Kernfunktion bei geöffnetem Ticket wurde auf beiden Geräten
  erfolgreich geprüft; offene Fehler sind vor dem Pilot behoben.
- [ ] Grenzen bei gesperrtem Handy, Hintergrundbetrieb, Ton und Vibration
  wurden dem Betreiber verständlich erklärt und dokumentiert.
- [ ] Der Betreiber hat einen passenden Ablauf für ausbleibende Signale
  festgelegt, zum Beispiel sichtbares Ticket plus einen vereinbarten
  Vor-Ort-Aufruf. Der konkrete Ersatzablauf ist noch zu bestätigen.
- [ ] Gästehinweise, Werbung und Personal-Einweisung machen keine stärkeren
  Benachrichtigungszusagen als die geprüfte Funktion erlaubt.

## Betrieb und Zahlungen

- [ ] Backup und Wiederherstellung der SQLite-Datenbank und der benötigten
  Konfiguration sind geprüft. Der Betreiber kennt Hosting-Laufzeit und
  Guthabengrenzen und hat den Betrieb für den Pilot freigegeben.
- [ ] Testmandant und Dummy-Daten sind vom echten Geschäft getrennt.
- [ ] Wenn der Pilot ohne Bezahl-Abos läuft: Zahlungsmodus bleibt deaktiviert.
- [ ] Wenn Bezahl-Abos angeboten werden sollen: echte Anbieter-Sandbox,
  Preise, steuerliche/rechtliche Angaben und Verkaufsfreigabe zusätzlich
  nach [BILLING.md](BILLING.md) abnehmen. Das ist ein separates Verkaufsgate.

## Abnahmeprotokoll

- Pilotgeschäft / Verantwortlicher:
- Geplanter Beginn:
- Geprüft am / durch:
- Verwendete iPhone-/Android-Geräte und Browser:
- Ergebnis und offene Fehler:
- Bestätigter Ersatzablauf für ausbleibende Signale:
- Betreiber-/Kontaktdaten vollständig geprüft:
- EU-Laufzeitregion und Volume bestätigt:
- Entscheidung des Betreibers zum Pilotstart:
