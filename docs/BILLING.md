# Abo-Anbindung: Einrichtung, Grenzen und Abnahme

Stand: 22.11.2026, v0.5.0.

## Sicherheitsstand

- Standard: `BILLING_MODE=disabled`. Keine Anbieteraufrufe, kein Checkout.
- `BILLING_MODE=test`: ausschließlich Stripe-Testschlüssel und PayPal-Sandbox.
- Live-Verkauf bleibt zusätzlich im Checkout-Code gesperrt. Ein Env-Schalter allein kann ihn nicht aktivieren.
- Die Anbieterabläufe wurden mit simulierten Antworten automatisiert geprüft. Ein echter Sandbox-End-to-End-Test ist ohne Konten/Schlüssel noch ausstehend.
- Tarife sind unverbindliche Entwürfe. Die bisherigen Standardpreise 0/19/49 EUR und deren Steuer-/Leistungsumfang brauchen Betreiberfreigabe. Support- und Rechtskonformitätszusagen werden nicht vorausgesetzt.
- Noch keine tarifabhängigen Funktionssperren. Bestehende Geschäfte behalten ihre bisherigen Funktionen. Ein Abo-Status allein ändert keine Berechtigungen.
- Rechtstexte sind Entwürfe. Betreiberangaben, Auftragsverarbeitung, Datenschutzprüfung, Preis-/Steuerdarstellung und Vertragsbedingungen sind vor einem kommerziellen Start zu vervollständigen. EU-Hosting allein begründet keine DSGVO-Konformität.

## Zugang und Ablauf

`/abo` ist Teil derselben App. Nur Geschäftsinhaber mit E-Mail-/Passwort-Session dürfen Checkout, Statusprüfung und Kündigung verwenden. Personal-PINs reichen nicht aus. Der Link ist im Inhaber-Dashboard sichtbar. Die Tarifwahl von `/preise` wird über `/anmelden?plan=…` nach `/abo` weitergegeben.

Stripe öffnet Hosted Checkout. PayPal öffnet die Sandbox-Freigabeseite. Die Zahlungsdaten gehen an den Anbieter, nicht an QueueUp. Die Rückkehr zu `/abo?result=return` ist **keine Zahlungsbestätigung**. Nur verifizierte Anbieterantworten setzen den Status. Beim Rücksprung kann der Inhaber den Anbieterstatus manuell prüfen, zusätzlich werden Webhooks verarbeitet.

Ein teilweise eindeutiger Datenbankindex erlaubt nur einen offenen Vorgang pro Geschäft, auch über beide Anbieter hinweg. Beim Timeout bleibt der Vorgang `uncertain`; ein neuer Kauf wird blockiert, damit kein Doppelabo entsteht. Betreiber müssen dann mit der Vorgangs-ID (`billing_orders.id`, zugleich Idempotency-Key/custom_id/metadata.billing_id) beim Anbieter prüfen und den Vorgang fachkundig abgleichen. Kein automatisches Wegklicken oder Wiederbestellen. Es gibt dafür noch keinen automatischen Reparatur-Dialog.

Vor Checkout werden Preis, Währung und monatliches Intervall gegen den Anbieter geprüft. Nur ein monatlicher, unbefristeter regulärer PayPal-Zyklus ohne Extra-Setupgebühr und ohne Trial wird unterstützt. Stripe benötigt einen wiederkehrenden Monatspreis ohne Mengenstaffeln. Ein abweichender oder ungeklärter Preis blockiert den Vorgang.

Die Kündigung ist eine ausdrücklich bestätigte, sofortige Kündigung beim Anbieter, ohne automatische Erstattung. QueueUp markiert sie erst nach erneuter Anbieterprüfung als beendet. Scheitert die Bestätigung, bleibt der Status offen. Kein Versprechen einer Kündigung zum Periodenende.

## Erforderliche Konfiguration

Der Betreiber kann Schlüssel später selbst unter `/admin`, Tab Webseiten-Inhalte,
Zahlungseinstellungen, eintragen. Felder sind beim Eingeben maskiert. Gespeicherte
Werte werden niemals im Klartext zurückgesendet, nur der Status und die letzten
vier Zeichen. Leere Eingabe lässt den alten Wert unverändert; mit der separaten
Löschoption wird er entfernt. Modus und HTTPS-Basisadresse sind dort ebenfalls
pflegbar. Ein Neustart ist nicht nötig. Anbieter-Zugänge dürfen niemals in Git
oder in den öffentlich ausgelieferten JavaScript-Code.

Die Konfiguration liegt AES-256-GCM-verschlüsselt in `billing_config`. Der
zufällige 32-Byte-Root-Key liegt separat in `$DATA_DIR/.billing-key` (0600),
alternativ als `BILLING_CONFIG_KEY` mit 64 Hex-Zeichen. DB und Root-Key müssen
zusammen gesichert werden. Ein Verlust oder Wechsel des Root-Keys macht
bestehende Werte unlesbar. Verschlüsselung schützt bei einem isolierten
DB-Leak, nicht bei Zugriff auf den gesamten Server oder Datenträger. Die App
benötigt ihre üblichen Zugriffsschutz-/Backupmaßnahmen weiterhin.

Umgebungsvariablen sind ein optionaler Vorbelegungsweg. Explizit im Admin
hinterlegte Werte haben Vorrang, auch beim Löschen. Keine Klartext-Logs.
Ein Moduswechsel wird bei offenen Abovorgängen blockiert. Ein Wechsel des
Anbieter-Kontos muss vorher mit vorhandenen Abos abgeglichen werden.

| Variable | Zweck |
|---|---|
| `BILLING_MODE` | `disabled` (Standard) oder `test`; Live-Verkauf ist gesperrt |
| `PUBLIC_BASE_URL` | Exakte HTTPS-Basis, aktuell `https://virtual-waitlist-production.up.railway.app` |
| `STRIPE_SECRET_KEY` | Stripe-Testschlüssel `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Signaturgeheimnis `whsec_…` des passenden Test-Webhook-Endpunkts |
| `PAYPAL_CLIENT_ID` | Client-ID der PayPal-Sandbox-App |
| `PAYPAL_CLIENT_SECRET` | Secret derselben Sandbox-App |
| `PAYPAL_WEBHOOK_ID` | ID des Webhooks derselben Sandbox-App |

Kein Stripe Publishable Key erforderlich, da Hosted Checkout verwendet wird.

Im Admin pro kostenpflichtigem Tarif hinterlegen:

- `stripe_price_id` (z. B. `price_…`), aktiver EUR-Monatspreis aus Stripe-Testbetrieb.
- `paypal_plan_id` (`P-…`), aktiver Plan derselben Sandbox-App, Preis und Intervall müssen übereinstimmen.

Schlüssel und IDs müssen zur selben Umgebung gehören. IDs sind keine Passwörter. IDs lassen sich unter `/admin`, Tab Abo-Modelle, pflegen. Unter Webseiten-Inhalte sind Maskierung und Eingabefelder für die Konfiguration sichtbar, niemals gespeicherte Klartexte.

## Webhooks

Basis: `https://virtual-waitlist-production.up.railway.app`

- Stripe: `/api/webhooks/stripe`. Ereignisse: `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- PayPal: `/api/webhooks/paypal`. Ereignisse: `BILLING.SUBSCRIPTION.CREATED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`.

Stripe: HMAC-SHA256 auf unveränderten Rohbytes, konstante Signaturprüfung, Zeitfenster 5 Minuten, getrennte Test-/Live-Prüfung. API-Version ist auf `2024-06-20` gepinnt. Diese Version muss im Sandbox-Abnahmetest mit dem Konto verifiziert werden.

PayPal: Postback-Prüfung über `/v1/notifications/verify-webhook-signature` mit allen Signatur-Headern und konfigurierter Webhook-ID. Originalereignis wird ohne Neuformatierung eingebettet. Webhook-Simulator-Mocks unterstützen diese Postback-Methode laut Anbieter nicht. Für End-to-End echte Sandbox-Ereignisse verwenden.

Beide: Ereignis-ID wird dedupliziert, Abo wird beim Anbieter erneut gelesen. So können verspätete Ereignisse nicht blind einen alten Status zurückschreiben. Keine Aktivierung allein durch eine Erfolgs-URL oder durch den vom Browser behaupteten Status.

## Datenmodell

`billing_orders` enthält Geschäft/Tarif, Anbieter, Modus, Preis-/Währungssnapshot, Remote-Plan, Checkout-/Abo-Referenz, Status und Zeitstempel. `billing_config` enthält ausschließlich verschlüsselte Anbietereinstellungen. `billing_events` enthält Anbieter/Ereignis-ID zur Deduplizierung. Keine Kartendaten, keine Anbieter-Geheimnisse.

Die in v0.4 angelegte Tabelle `subscriptions` wird zur Kompatibilität beibehalten, ist aber nicht die Quelle der aktuellen Zahlungsanbindung. Admin und `/abo` lesen `billing_orders`.

## Tests und Freigabeschritte

`npm test`: Signaturprüfung, Replay, Modus-Sperre, Besitzerrechte, DB-Duplikatschutz, Stripe-/PayPal-Checkout, Abgleich und Kündigung mit simulierten Anbieterantworten sowie vollständige HTTP-Auth-/Routingprüfung.

Vor Freigabe:

1. Betreiber-/Firmenangaben und tatsächliche Kontaktadresse ergänzen. Tarife, Steuerbehandlung und Leistungen bestätigen.
2. Sandbox-Konten und Tarife anlegen, Schlüssel im Admin sicher hinterlegen, Webhooks registrieren.
3. Beide Anbieter mit echten Sandbox-Käufern durchspielen: Freigabe, Abbruch, verzögerter Webhook, doppelte Events, Preisabweichung, Erneuerung/Fehler und Kündigung.
4. Rechtliche Prüfung inkl. Vertrags-/Kündigungsweg und Datenschutz durchführen; Feature-Entitlements und Grenzen verbindlich definieren.
5. Erst danach Live-Freigabe besprechen und die Codesperre bewusst ändern. Keine automatischen Echtzahlungen aus diesem Stand.

## Anbieterquellen

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/api/subscriptions/cancel
- https://docs.stripe.com/api/checkout/sessions/expire
- https://developer.paypal.com/docs/api/subscriptions/v1/
- https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post
- https://developer.paypal.com/api/rest/webhooks/rest
- https://developer.paypal.com/subscriptions/webhooks
