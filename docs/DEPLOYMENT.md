# Deployment

Die App ist ein einzelner Node-Prozess ohne externe Abhängigkeiten. Sie läuft
aktuell live auf **Railway** als Multi-Tenant-SaaS.

## Aktuelles Live-Setup (Stand 22.11.2026, v0.5.0)

| Was | Wert |
|---|---|
| Anbieter | Railway (railway.com), Workspace „My Projects" |
| Projekt | `virtual-waitlist` (ID `0e9d31ad-3186-41a7-a51e-1a152ac57d14`) |
| Service | `virtual-waitlist` (ID `9a34dba5-aeda-46f3-9d4d-4e831f4c28ff`), **Region `europe-west4-drams3a` (EU West, Amsterdam)** |
| URL | https://virtual-waitlist-production.up.railway.app |
| Volume | `virtual-waitlist-volume`, gemountet auf `/data` (SQLite + Logos liegen dort) |
| Env-Vars | `STAFF_PIN` (PIN des Demo-Geschäfts, Wert im Tresor), `ADMIN_EMAIL` + `ADMIN_PASSWORD` (Plattform-Admin `/admin`, Wert im Tresor), `DATA_DIR=/data`, `PORT` (von Railway) |
| Konto | Agent-Mail-Konto, Zugangsdaten im Tresor des Besitzers (Eintrag „Railway") |

**Hosting-Standort (DSGVO):** Die App und ihre Datenbank laufen in der
Railway-Region **EU West (Amsterdam, Niederlande)**. Die Region wurde am
22.11.2026 von `iad` (US East) nach EU West verschoben
(`railway service scale iad=0 eu-west=1`); das Volume wurde dabei von Railway
in die neue Region migriert (kurzer Downtime während der Migration, Domain
bleibt unverändert).

**Kosten und Laufzeit:** Der Betrieb nutzt das bestehende Railway-Testkonto.
Restguthaben, Ablaufdatum und geltende Limits müssen im Railway-Konto geprüft
werden. Ein dauerhafter kostenloser Weiterbetrieb oder eine unbegrenzte
Aufbewahrung des Volumes nach Ablauf sind nicht zugesagt. Der Dienst kann
pausieren. Vor Tarifwechsel oder Hinterlegen einer Zahlmethode ist eine neue
Freigabe des Besitzers nötig. Regelmäßige eigene Backups sind erforderlich.

## Update-Ablauf (nach jeder Code-Änderung)

Voraussetzung: Railway CLI, eingeloggt mit dem Railway-Konto.

```bash
npm install @railway/cli        # einmalig
npx railway login               # Browser-Login (Railway-Konto)
cd virtual-waitlist             # ins Repo-Verzeichnis
npx railway link                # Projekt „virtual-waitlist" wählen (einmalig)
npx railway up                  # baut und deployed den aktuellen Stand
```

Danach kurz prüfen:

```bash
curl https://virtual-waitlist-production.up.railway.app/api/b/demo/settings
```

GitHub und Live-Stand synchron halten:

```bash
git add -A
git commit -m "Beschreibung der Änderung inkl. Doku-Update"
git push origin main
npx railway up
```

**Optional – Auto-Deploy bei jedem Push:** Im Railway-Dashboard
(https://railway.com/project/0e9d31ad-3186-41a7-a51e-1a152ac57d14) → Service →
Settings → Source → „Connect Repo" → GitHub-Repo `IT-Kayali/virtual-waitlist`
verbinden. Danach deployed Railway automatisch bei jedem Push auf `main`.
(Dafür muss sich der GitHub-Besitzer einmal bei Railway mit GitHub anmelden.)

## Neu auf Railway deployen (von null)

```bash
npm install @railway/cli
npx railway login
cd virtual-waitlist
npx railway init --name virtual-waitlist
npx railway up                                  # erster Deploy
npx railway variables --set "STAFF_PIN=<6-stellige-PIN>" --set "DATA_DIR=/data"
npx railway volume add -m /data                 # persistentes Volume für SQLite
npx railway domain                              # öffentliche URL erzeugen
# Region EU (DSGVO):
npx railway scale us-west2=0 eu-west=1

# WICHTIG: `railway up` setzt die Region auf den Standard (us-west2) zurueck.
# Nach JEDEM `railway up` die Region erneut anwenden:
#   npx railway scale us-west2=0 eu-west=1
# (Danach kurz warten und mit `railway status` pruefen: Region muss EU West sein.)
```

Railway erkennt Node.js automatisch (Nixpacks) und startet mit `npm start`
(siehe `package.json`). Node-Version kommt aus `engines` (≥ 22).

## Regionen

Verfügbar: `us-west`, `us-east`/`iad`, `eu-west` (Amsterdam),
`southeast-asia`. Ändern jederzeit möglich, Domain bleibt gleich; mit Volume
gibt es während der Volume-Migration Downtime. Siehe
https://docs.railway.com/deployments/regions

## Alternativen

- **Render:** Free-Tier hat **keine** persistenten Disks – SQLite geht bei
  jedem Neustart verloren. Nur mit bezahltem Disk (ab 7 $/Monat + 0,25 $/GB)
  sinnvoll. Start-Kommando `node server.js`, Volume auf `data/` mounten.
- **Eigener VPS (z. B. Hetzner, ~4 €/Monat, Standort wählbar):** Repo klonen,
  `STAFF_PIN=... node server.js` (z. B. via systemd oder pm2), Caddy/nginx
  für HTTPS davor. Daten bleiben auf der lokalen Disk.
- HTTPS ist wichtig: Browser-Benachrichtigungen und Vibration auf Handys
  brauchen eine sichere Verbindung.

## Betrieb

- **Plattform-Admin-Zugang ändern:** `npx railway variables --set "ADMIN_EMAIL=..." --set "ADMIN_PASSWORD=..."` (löst Redeploy aus).

- **Demo-PIN ändern:** `npx railway variables --set "STAFF_PIN=<neue-PIN>"`
  (löst Redeploy aus). Gilt nur für das Demo-Geschäft; andere Geschäfte
  verwalten ihre PIN im eigenen Dashboard (Inhaber-Login).
- **Lokalnamen, Logos, Mitarbeiter, „Fast dran"-Schwelle:** jeweils im
  Dashboard des Geschäfts unter `/b/<slug>/staff`.
- **Logs:** `npx railway logs` oder im Dashboard.
- **Daten sichern:** SQLite-Datei liegt im Volume unter `/data/queue.db`,
  hochgeladene Logos unter `/data/logos/`; Download über
  `npx railway service files` bzw. Dashboard → Volume.


## Abo-System v0.5.0

Standard ohne Keys: `BILLING_MODE=disabled`. Keine Echtzahlungen.
Alle benötigten Variablen, Anbieter-IDs, Webhook-URLs und Abnahmeschritte
stehen in [BILLING.md](BILLING.md). Keine Geheimnisse in Git oder Logs
schreiben. Rechtstexte/Preise sind noch nicht freigegeben.

## Deploy-Verifikation

Nach Upload und EU-Region-Anwendung: Status und Region lesen, Startseite,
Admin, `/abo`, Demo-Settings und Daten prüfen. Browser-Ansicht auf Desktop
und Mobil prüfen. Der Prozess behandelt SIGTERM/SIGINT geordnet und schließt
offene Requests vor SQLite. Bisherige Crash-Meldungen fielen zeitlich mit
Deploys zusammen; daraus allein ist deren genaue Ursache nicht bewiesen.
