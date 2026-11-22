'use strict';
// Subscription adapters. Provider calls are injected only by local tests, never by request/env URLs.
const crypto = require('crypto');

function verifyStripe(raw, header, secret, now = Date.now()) {
  const parts = String(header || '').split(',').map(x => x.split('='));
  const t = parts.find(x => x[0] === 't')?.[1];
  if (!t || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest();
  return parts.filter(x => x[0] === 'v1').some(x => {
    const got = Buffer.from(x[1] || '', 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

module.exports = function registerBilling({ db, route, send, readBody, fetcher = fetch, env = process.env }) {
  const mode = env.BILLING_MODE || 'disabled';
  const origin = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const stripeKey = env.STRIPE_SECRET_KEY || '';
  const stripeSecret = env.STRIPE_WEBHOOK_SECRET || '';
  const ppBase = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  db.exec(`CREATE TABLE IF NOT EXISTS billing_orders (
    id TEXT PRIMARY KEY, business_id INTEGER NOT NULL, plan_id INTEGER NOT NULL,
    provider TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'creating',
    amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, remote_plan TEXT NOT NULL,
    checkout_ref TEXT, provider_ref TEXT, checkout_url TEXT,
    current_period_end TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS billing_one_open_per_business ON billing_orders(business_id)
    WHERE status NOT IN ('cancelled','expired','failed');
  CREATE UNIQUE INDEX IF NOT EXISTS billing_remote_ref ON billing_orders(provider, provider_ref) WHERE provider_ref IS NOT NULL;
  CREATE TABLE IF NOT EXISTS billing_events (provider TEXT NOT NULL, id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(provider,id));`);

  function configured(provider) {
    if (!['test', 'live'].includes(mode) || !/^https:\/\//.test(origin)) return false;
    if (mode === 'live' && env.BILLING_LIVE_APPROVED !== 'true') return false;
    if (provider === 'stripe') return !!stripeSecret && (mode === 'test' ? /^sk_test_/.test(stripeKey) : /^sk_live_/.test(stripeKey));
    return !!env.PAYPAL_CLIENT_ID && !!env.PAYPAL_CLIENT_SECRET && !!env.PAYPAL_WEBHOOK_ID;
  }
  const lastCall = new Map();
  function limited(session, action, ms) {
    const k = session.business_id + ':' + action, prev = lastCall.get(k) || 0;
    if (Date.now() - prev < ms) return true;
    lastCall.set(k, Date.now());
    if (lastCall.size > 10000) for (const [key, time] of lastCall) if (Date.now() - time > 60000) lastCall.delete(key);
    return false;
  }
  function view(row) {
    if (!row) return null;
    return { id: row.id, plan_id: row.plan_id, provider: row.provider, mode: row.mode, status: row.status,
      amount_cents: row.amount_cents, currency: row.currency, current_period_end: row.current_period_end,
      created_at: row.created_at, plan_name: db.prepare('SELECT name FROM plans WHERE id=?').get(row.plan_id)?.name };
  }
  async function request(url, opts = {}) {
    const r = await fetcher(url, { ...opts, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Anbieterantwort unlesbar'); }
    if (!r.ok) throw new Error('Zahlungsanbieter nicht verfügbar (' + r.status + ')');
    return data;
  }
  function stripe(path, method = 'GET', fields, idem) {
    return request('https://api.stripe.com/v1/' + path, {
      method, headers: { Authorization: 'Bearer ' + stripeKey, 'Stripe-Version': '2024-06-20',
        ...(fields ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idem ? { 'Idempotency-Key': idem } : {}) },
      ...(fields ? { body: new URLSearchParams(fields).toString() } : {}),
    });
  }
  let ppToken = null, ppUntil = 0;
  async function paypal(path, method = 'GET', body, idem, rawBody) {
    if (!ppToken || Date.now() > ppUntil) {
      const d = await request(ppBase + '/v1/oauth2/token', { method: 'POST', headers: {
        Authorization: 'Basic ' + Buffer.from(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      }, body: 'grant_type=client_credentials' });
      ppToken = d.access_token; ppUntil = Date.now() + Math.max(0, Number(d.expires_in) - 60) * 1000;
      if (!ppToken) throw new Error('PayPal-Anmeldung fehlgeschlagen');
    }
    return request(ppBase + path, { method, headers: { Authorization: 'Bearer ' + ppToken,
      'Content-Type': 'application/json', ...(idem ? { 'PayPal-Request-Id': idem } : {}) },
      ...(rawBody ? { body: rawBody } : body ? { body: JSON.stringify(body) } : {}) });
  }
  function update(row, state, end) {
    db.prepare(`UPDATE billing_orders SET status=?, current_period_end=?, updated_at=datetime('now') WHERE id=?`)
      .run(state, end || null, row.id);
  }
  async function sync(row) {
    if (!row.provider_ref && row.provider === 'stripe' && row.checkout_ref) {
      const session = await stripe('checkout/sessions/' + encodeURIComponent(row.checkout_ref));
      if (session.client_reference_id !== row.id) throw new Error('Checkout-Zuordnung stimmt nicht');
      if (session.status === 'expired') { update(row, 'expired'); return; }
      if (session.subscription) {
        row.provider_ref = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        db.prepare('UPDATE billing_orders SET provider_ref=? WHERE id=?').run(row.provider_ref, row.id);
      } else return;
    }
    if (!row.provider_ref) return;
    if (row.provider === 'stripe') {
      const d = await stripe('subscriptions/' + encodeURIComponent(row.provider_ref));
      const item = d.items?.data?.[0];
      if (d.metadata?.billing_id !== row.id || item?.price?.id !== row.remote_plan || d.items.data.length !== 1 || item.quantity !== 1 || !!d.livemode !== (mode === 'live')) {
        throw new Error('Abo-Zuordnung oder Tarif stimmt nicht');
      }
      const state = ({ active: 'active', trialing: 'trialing', canceled: 'cancelled', incomplete_expired: 'expired',
        past_due: 'past_due', unpaid: 'past_due', incomplete: 'pending', paused: 'suspended' })[d.status] || 'pending';
      const end = d.current_period_end || item.current_period_end;
      update(row, state, end ? new Date(end * 1000).toISOString() : null);
    } else {
      const d = await paypal('/v1/billing/subscriptions/' + encodeURIComponent(row.provider_ref));
      if (d.custom_id !== row.id || d.plan_id !== row.remote_plan) throw new Error('PayPal-Abo-Zuordnung stimmt nicht');
      const state = ({ ACTIVE: 'active', CANCELLED: 'cancelled', EXPIRED: 'expired', SUSPENDED: 'suspended',
        APPROVAL_PENDING: 'pending', APPROVED: 'pending' })[d.status] || 'pending';
      update(row, state, d.billing_info?.next_billing_time);
    }
  }
  route('GET', '/api/billing/status', async (req, res, _u, _p, _q, session) => {
    const row = db.prepare('SELECT * FROM billing_orders WHERE business_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(session.business_id);
    return send(res, 200, { mode, stripe: configured('stripe'), paypal: configured('paypal'), subscription: view(row),
      note: 'Tarifentwürfe. Bisher keine tarifabhängigen Funktionssperren. Zahlungen nur nach gesonderter Freigabe.' });
  }, { staff: true, owner: true });

  route('POST', '/api/billing/checkout', async (req, res, _u, _p, _q, session) => {
    const b = await readBody(req);
    const provider = b.provider;
    if (limited(session, 'checkout', 5000)) return send(res, 429, { error: 'Bitte kurz warten.' });
    if (!['stripe', 'paypal'].includes(provider)) return send(res, 400, { error: 'Zahlungsanbieter wählen.' });
    if (!configured(provider)) return send(res, 503, { error: 'Zahlungen sind noch nicht freigeschaltet. Es wird nichts berechnet.' });
    const plan = db.prepare('SELECT * FROM plans WHERE slug=? AND active=1').get(String(b.plan || ''));
    if (!plan || plan.price_cents <= 0) return send(res, 400, { error: 'Kostenpflichtigen Tarif wählen.' });
    const remote = provider === 'stripe' ? plan.stripe_price_id : plan.paypal_plan_id;
    if (!remote) return send(res, 503, { error: 'Dieser Tarif ist beim Zahlungsanbieter noch nicht eingerichtet.' });
    if (mode === 'live') return send(res, 503, { error: 'Live-Verkauf braucht zuerst rechtliche Prüfung, Tarif-Freigabe und vollständigen Sandbox-Abnahmetest.' });
    const existing = db.prepare("SELECT * FROM billing_orders WHERE business_id=? AND status NOT IN ('cancelled','expired','failed')").get(session.business_id);
    if (existing) {
      if (existing.status === 'pending' && existing.checkout_url && existing.provider === provider && existing.plan_id === plan.id)
        return send(res, 200, { url: existing.checkout_url, resumed: true });
      return send(res, 409, { error: 'Es gibt bereits ein laufendes oder ungeklärtes Abo. Bitte Status prüfen, bevor Sie erneut bestellen.' });
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO billing_orders(id,business_id,plan_id,provider,mode,amount_cents,currency,remote_plan)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, session.business_id, plan.id, provider, mode, plan.price_cents, plan.currency, remote);
    try {
      // Provider price must match the displayed monthly gross amount, without trials/setup fees.
      let result, ref, url;
      if (provider === 'stripe') {
        const p = await stripe('prices/' + encodeURIComponent(remote));
        if (!p.active || p.unit_amount !== plan.price_cents || p.currency.toUpperCase() !== plan.currency ||
            p.recurring?.interval !== 'month' || p.recurring.interval_count !== 1 || p.type !== 'recurring' || p.livemode)
          throw new Error('Stripe-Testpreis stimmt nicht mit dem Monatstarif überein');
        result = await stripe('checkout/sessions', 'POST', { mode: 'subscription', client_reference_id: id,
          'line_items[0][price]': remote, 'line_items[0][quantity]': '1',
          'subscription_data[metadata][billing_id]': id,
          'metadata[billing_id]': id, customer_email: session.business.email,
          success_url: origin + '/abo?result=return', cancel_url: origin + '/abo?result=cancel',
        }, id);
        ref = result.id; url = result.url;
        if (!/^https:\/\/checkout\.stripe\.com\//.test(url || '')) throw new Error('Ungültige Stripe-Weiterleitung');
      } else {
        const p = await paypal('/v1/billing/plans/' + encodeURIComponent(remote));
        const cycles = p.billing_cycles || [], c = cycles[0], fee = p.payment_preferences?.setup_fee;
        if (p.status !== 'ACTIVE' || cycles.length !== 1 || c.tenure_type !== 'REGULAR' || c.total_cycles !== 0 ||
            c.frequency?.interval_unit !== 'MONTH' || c.frequency.interval_count !== 1 ||
            Math.round(Number(c.pricing_scheme?.fixed_price?.value) * 100) !== plan.price_cents ||
            c.pricing_scheme?.fixed_price?.currency_code !== plan.currency || (fee && Number(fee.value) !== 0) ||
            (p.taxes && Number(p.taxes.percentage) !== 0 && !p.taxes.inclusive))
          throw new Error('PayPal-Testplan stimmt nicht mit dem Monatstarif überein');
        result = await paypal('/v1/billing/subscriptions', 'POST', { plan_id: remote, custom_id: id,
          application_context: { brand_name: 'QueueUp', user_action: 'SUBSCRIBE_NOW',
            return_url: origin + '/abo?result=return', cancel_url: origin + '/abo?result=cancel' } }, id);
        ref = result.id; url = result.links?.find(l => l.rel === 'approve')?.href;
        if (!/^https:\/\/www\.sandbox\.paypal\.com\//.test(url || '')) throw new Error('Ungültige PayPal-Weiterleitung');
      }
      if (!ref) throw new Error('Anbieterreferenz fehlt');
      db.prepare(`UPDATE billing_orders SET status='pending', checkout_ref=?, provider_ref=?, checkout_url=? WHERE id=?`)
        .run(provider === 'stripe' ? ref : null, provider === 'paypal' ? ref : null, url, id);
      return send(res, 200, { url, mode });
    } catch (e) {
      // A timeout could mean the provider created it. Do not release the duplicate guard.
      update({ id }, 'uncertain');
      console.error('Billing checkout:', id, e.message);
      return send(res, 502, { error: 'Abschluss nicht bestätigt. Bitte nicht erneut bestellen. Betreiber muss den Vorgang beim Anbieter prüfen.' });
    }
  }, { staff: true, owner: true });

  route('POST', '/api/billing/refresh', async (req, res, _u, _p, _q, session) => {
    if (limited(session, 'refresh', 10000)) return send(res, 429, { error: 'Bitte zehn Sekunden warten.' });
    const row = db.prepare("SELECT * FROM billing_orders WHERE business_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(session.business_id);
    if (!row) return send(res, 200, { subscription: null });
    if (!configured(row.provider) || row.mode !== mode) return send(res, 503, { error: 'Anbieter nicht konfiguriert.' });
    try { await sync(row); return send(res, 200, { subscription: view(db.prepare('SELECT * FROM billing_orders WHERE id=?').get(row.id)) }); }
    catch { return send(res, 502, { error: 'Anbieterstatus derzeit nicht prüfbar. Keine Änderung übernommen.' }); }
  }, { staff: true, owner: true });

  route('POST', '/api/billing/cancel', async (req, res, _u, _p, _q, session) => {
    const b = await readBody(req);
    if (b.confirm !== true) return send(res, 400, { error: 'Kündigung bestätigen.' });
    const row = db.prepare('SELECT * FROM billing_orders WHERE id=? AND business_id=?').get(String(b.id || ''), session.business_id);
    if (!row || ['cancelled', 'expired', 'failed'].includes(row.status)) return send(res, 404, { error: 'Kein kündbares Abo gefunden.' });
    if (!configured(row.provider) || row.mode !== mode) return send(res, 503, { error: 'Anbieter nicht konfiguriert.' });
    try {
      await sync(row);
      if (row.provider === 'stripe') {
        if (row.provider_ref) await stripe('subscriptions/' + encodeURIComponent(row.provider_ref), 'DELETE');
        else if (row.checkout_ref) await stripe('checkout/sessions/' + encodeURIComponent(row.checkout_ref) + '/expire', 'POST', {}, row.id + '-cancel');
        else throw new Error('Ungeklärter Vorgang');
      } else {
        if (!row.provider_ref) throw new Error('Ungeklärter Vorgang');
        await paypal('/v1/billing/subscriptions/' + encodeURIComponent(row.provider_ref) + '/cancel', 'POST', { reason: 'Vom Geschäft im QueueUp-Konto gekündigt' });
      }
      await sync(row);
      const fresh = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(row.id);
      if (!['cancelled', 'expired'].includes(fresh.status)) throw new Error('Kündigung noch nicht bestätigt');
      return send(res, 200, { subscription: view(fresh) });
    } catch { return send(res, 502, { error: 'Kündigung nicht bestätigt. Bitte Anbieter prüfen. Das Abo wird nicht fälschlich als gekündigt markiert.' }); }
  }, { staff: true, owner: true });

  async function rawBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 256000) throw new Error('Body zu groß'); chunks.push(c); }
    return Buffer.concat(chunks);
  }
  route('POST', '/api/webhooks/stripe', async (req, res) => {
    if (!configured('stripe')) return send(res, 503, { error: 'Deaktiviert' });
    const raw = await rawBody(req);
    if (!verifyStripe(raw, req.headers['stripe-signature'], stripeSecret)) return send(res, 400, { error: 'Signatur ungültig' });
    let event; try { event = JSON.parse(raw); } catch { return send(res, 400, { error: 'JSON ungültig' }); }
    if (!!event.livemode !== (mode === 'live') || !event.id) return send(res, 400, { error: 'Modus/ID ungültig' });
    if (db.prepare('SELECT 1 FROM billing_events WHERE provider=? AND id=?').get('stripe', event.id)) return send(res, 200, { ok: true });
    try {
      const obj = event.data?.object;
      const row = String(event.type).startsWith('checkout.session.')
        ? db.prepare("SELECT * FROM billing_orders WHERE provider='stripe' AND checkout_ref=?").get(obj?.id || '')
        : db.prepare("SELECT * FROM billing_orders WHERE provider='stripe' AND provider_ref=?").get(obj?.id || '');
      if (row && row.mode === mode) await sync(row);
      db.prepare('INSERT OR IGNORE INTO billing_events(provider,id) VALUES (?,?)').run('stripe', event.id);
      return send(res, 200, { ok: true });
    } catch { return send(res, 502, { error: 'Synchronisierung fehlgeschlagen, Wiederholung erforderlich' }); }
  });
  route('POST', '/api/webhooks/paypal', async (req, res) => {
    if (!configured('paypal')) return send(res, 503, { error: 'Deaktiviert' });
    const raw = await rawBody(req);
    let event; try { event = JSON.parse(raw); } catch { return send(res, 400, { error: 'JSON ungültig' }); }
    const h = req.headers;
    if (!h['paypal-transmission-id'] || !h['paypal-transmission-sig'] || !h['paypal-cert-url'] || !h['paypal-transmission-time'] || !h['paypal-auth-algo'])
      return send(res, 400, { error: 'Signatur fehlt' });
    try {
      // Embed the received event verbatim in the postback payload, do not reserialize it.
      const head = { transmission_id: h['paypal-transmission-id'], transmission_time: h['paypal-transmission-time'],
        transmission_sig: h['paypal-transmission-sig'], cert_url: h['paypal-cert-url'], auth_algo: h['paypal-auth-algo'], webhook_id: env.PAYPAL_WEBHOOK_ID };
      const payload = JSON.stringify(head).slice(0, -1) + ',"webhook_event":' + raw.toString('utf8') + '}';
      const check = await paypal('/v1/notifications/verify-webhook-signature', 'POST', null, null, payload);
      if (check.verification_status !== 'SUCCESS' || !event.id) return send(res, 400, { error: 'Signatur ungültig' });
      if (db.prepare('SELECT 1 FROM billing_events WHERE provider=? AND id=?').get('paypal', event.id)) return send(res, 200, { ok: true });
      const ref = event.event_type?.startsWith('BILLING.SUBSCRIPTION.') ? event.resource?.id : event.resource?.billing_agreement_id;
      const row = db.prepare("SELECT * FROM billing_orders WHERE provider='paypal' AND provider_ref=?").get(ref || '');
      if (row && row.mode === mode) await sync(row);
      db.prepare('INSERT OR IGNORE INTO billing_events(provider,id) VALUES (?,?)').run('paypal', event.id);
      return send(res, 200, { ok: true });
    } catch { return send(res, 502, { error: 'Anbieterprüfung fehlgeschlagen, Wiederholung erforderlich' }); }
  });
  route('GET', '/api/admin/billing', async (req, res) => {
    const rows = db.prepare(`SELECT o.*, b.name AS business_name, b.slug FROM billing_orders o
      JOIN businesses b ON b.id=o.business_id ORDER BY o.created_at DESC LIMIT 500`).all();
    return send(res, 200, { mode, subscriptions: rows.map(r => ({ ...view(r), business_name: r.business_name, slug: r.slug })) });
  }, { admin: true });
};
module.exports.verifyStripe = verifyStripe;
