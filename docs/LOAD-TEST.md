# Begrenzter Live-Lasttest

Stand: 22.11.2026, 13:46 Uhr MEZ. Version 0.5.0, Anwendungscode aa9bcac.
Ziel: https://virtual-waitlist-production.up.railway.app
Testmandant: `live-check-cafe`. Die Demo wurde nicht belastet.

## Ablauf

Je Stufe starten 10, 50 beziehungsweise 100 parallele Nutzerabläufe. Jeder
Ablauf lädt entweder die Gäste- oder Kiosk-Seite, legt ein Ticket an, fragt
es dreimal im Abstand von drei Sekunden ab und storniert es anschließend.
Zwischen den Stufen liegt eine Pause von drei Sekunden. Es wurden keine
Zahlungen ausgelöst. Login, Anbieter-APIs und Webhooks waren nicht Teil
dieses Lasttests.

Abbruchgrenzen: mehr als fünf Prozent Fehler oder p95 über drei Sekunden.
Keine dieser Grenzen wurde erreicht.

## Messergebnisse

| Parallele Abläufe | Requests | Fehler | Median | p95 | p99 | Maximum |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 60 | 0 | 184 ms | 324 ms | 353 ms | 353 ms |
| 50 | 300 | 0 | 181 ms | 549 ms | 620 ms | 641 ms |
| 100 | 600 | 0 | 183 ms | 619 ms | 743 ms | 997 ms |

Insgesamt: 960 gemessene Requests, 160 erzeugte Testtickets, 160 erfolgreiche
Stornierungsantworten. Die drei Stufen dauerten jeweils 10,36 / 10,63 / 11,36
Sekunden, einschließlich der Polling-Wartezeiten. Die aktive Testwarteschlange
war danach wieder leer. Die früher vorhandene Abholliste blieb erhalten.

Bei 100 parallelen Abläufen lag p95 pro Endpunkt bei 743 ms (Gäste-Seite),
744 ms (Kiosk), 640 ms (Beitritt), 282 ms (Ticketabfrage) und 310 ms
(Stornierung). Die Gesamtverteilung wird separat über alle Requests berechnet.

## Aussagekraft und Grenzen

Der Test zeigt, dass diese kurze Last auf dem aktuellen kleinen Datenbestand
fehlerfrei verarbeitet wurde. Er bestimmt keine maximale Nutzerzahl und
belegt keinen Dauerbetrieb bei 100 oder mehr aktiven Nutzern. Gemessen wurde
von einem einzelnen externen Generator, einschließlich Netzwerkweg, mit
einem Mandanten und kurzen Abläufen. Browser-Rendering, große Datenmengen,
viele Mandanten, Ausfälle und Zahlungen sind damit nicht abgedeckt.

Vor starkem Wachstum sind längere Tests in einer getrennten Testumgebung,
Backup-/Restore-Tests und Messungen von CPU, RAM, Datenbank-Latenz und
Fehlerraten sinnvoll. Weitere Lasttests nicht ohne abgestimmten Umfang auf
dem laufenden Produkt wiederholen.

## Reproduzieren und Rohdaten

Das Skript `scripts/load-test.js` verwendet ausdrücklich den eigenen
Testmandanten und lehnt die Demo als Ziel ab. Aufruf und Parameter sind im
Skript dokumentiert. Die vollständigen Ergebnisse dieses Laufs liegen in
[test-results/load-test.json](test-results/load-test.json).
