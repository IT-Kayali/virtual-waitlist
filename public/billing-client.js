'use strict';
const byId = id => document.getElementById(id);
let billing = null;
const chosen = new URLSearchParams(location.search).get('plan');
byId('loginLink').href = '/anmelden' + (chosen ? '?plan=' + encodeURIComponent(chosen) : '');
const labels = { creating: 'Wird eingerichtet', pending: 'Freigabe ausstehend', active: 'Aktiv', cancelled: 'Gekündigt', expired: 'Abgelaufen', failed: 'Fehlgeschlagen', uncertain: 'Ungeklärt, Betreiberprüfung nötig', past_due: 'Zahlung überfällig', suspended: 'Ausgesetzt', trialing: 'Testphase' };
function showSubscription(s) {
  byId('subscriptionInfo').textContent = s
    ? `${s.plan_name} | ${s.provider === 'stripe' ? 'Stripe' : 'PayPal'} | ${s.mode === 'test' ? 'TEST' : 'LIVE'}\nStatus: ${labels[s.status] || s.status}\nBetrag: ${(s.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: s.currency })} pro Monat${s.current_period_end ? '\nNächster Abrechnungszeitpunkt/Periodenende: ' + new Date(s.current_period_end).toLocaleString('de-DE') : ''}`
    : 'Noch kein kostenpflichtiges Abo abgeschlossen.';
  byId('cancelSubscription').classList.toggle('hidden', !s || ['cancelled','expired','failed','uncertain','creating'].includes(s.status));
}
async function load() {
  try {
    const me = await siteApi('/api/me');
    billing = await siteApi('/api/billing/status');
    byId('accountName').textContent = me.name;
    byId('dashboardLink').href = '/b/' + encodeURIComponent(me.slug) + '/staff';
    byId('accountPanel').classList.remove('hidden');
    byId('accountNote').textContent = billing.note;
    byId('modeNotice').textContent = billing.mode === 'test'
      ? 'SANDBOX / TESTBETRIEB. Keine echten Zahlungen. Anbieterzugangsdaten und Testtarife müssen eingerichtet sein.'
      : 'Zahlungen sind noch nicht freigeschaltet. Es wird nichts berechnet.';
    showSubscription(billing.subscription);
  } catch {
    byId('loginPanel').classList.remove('hidden');
  }
  const data = await siteApi('/api/public/plans');
  byId('billingPlans').innerHTML = data.plans.map(p => {
    const price = p.price_cents ? (p.price_cents/100).toLocaleString('de-DE', { style:'currency',currency:p.currency }) + ' / Monat' : 'Kostenlos';
    const featureList = p.features.split('\n').filter(Boolean).map(f => '<li>' + esc(f) + '</li>').join('');
    const paid = p.price_cents > 0;
    const buttons = !paid ? '<p>Die kostenlose Nutzung ist bereits über Ihr Geschäftskonto möglich.</p>'
      : ['stripe','paypal'].map(provider => `<button class="btn ${provider === 'stripe' ? 'primary' : 'ghost'} full" style="margin-top:8px" data-checkout="${esc(p.slug)}" data-provider="${provider}" ${!billing || billing.mode !== 'test' || !billing[provider] ? 'disabled' : ''}>Mit ${provider === 'stripe' ? 'Stripe' : 'PayPal'} testen</button>`).join('');
    return `<div class="price-card ${chosen === p.slug ? 'highlight' : ''}"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="p-price" style="font-size:1.7rem">${esc(price)}</div><ul>${featureList}</ul>${buttons}</div>`;
  }).join('');
  document.querySelectorAll('[data-checkout]').forEach(btn => {
    btn.onclick = async () => {
      byId('statusError').textContent = '';
      if (!confirm('Sandbox-Testabo starten? Nur Testdaten verwenden. Es kann bereits ein Abo bestehen, Status vorher prüfen.')) return;
      btn.disabled = true;
      try {
        const d = await siteApi('/api/billing/checkout', { method:'POST', body:JSON.stringify({ plan:btn.dataset.checkout,provider:btn.dataset.provider }) });
        location.assign(d.url);
      } catch(e) { byId('statusError').textContent = e.message; btn.disabled = false; }
    };
  });
}
byId('refreshStatus').onclick = async () => {
  byId('refreshStatus').disabled = true;
  byId('statusError').textContent = '';
  try { const d = await siteApi('/api/billing/refresh', { method:'POST',body:'{}' }); billing.subscription = d.subscription; showSubscription(d.subscription); }
  catch(e) { byId('statusError').textContent = e.message; }
  finally { setTimeout(() => { byId('refreshStatus').disabled = false; }, 10000); }
};
byId('cancelSubscription').onclick = async () => {
  if (!billing?.subscription || !confirm('Abo sofort beim Zahlungsanbieter kündigen? Es gibt keine automatische Erstattung. Diese Aktion ist endgültig.')) return;
  byId('cancelSubscription').disabled = true;
  try { const d = await siteApi('/api/billing/cancel', { method:'POST',body:JSON.stringify({ id:billing.subscription.id,confirm:true }) }); billing.subscription = d.subscription; showSubscription(d.subscription); }
  catch(e) { byId('statusError').textContent = e.message; }
  finally { byId('cancelSubscription').disabled = false; }
};
load().catch(e => { byId('modeNotice').textContent = 'Tarife derzeit nicht verfügbar: ' + e.message; });
