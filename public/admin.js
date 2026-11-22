'use strict';

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fehler ' + res.status);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('emailInput').value, password: $('passInput').value }),
    });
    showDash();
  } catch (ex) {
    $('loginError').textContent = ex.message;
  }
};

$('logoutBtn').onclick = async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.reload();
};

/* ---------- Tabs ---------- */
let activeTab = 'biz';
document.querySelectorAll('.adm-tab').forEach((t) => {
  t.onclick = () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('.adm-tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.adm-panel').forEach((p) => p.classList.add('hidden'));
    $('tab-' + activeTab).classList.remove('hidden');
    if (activeTab === 'inquiries') loadInquiries();
    if (activeTab === 'plans') loadPlans();
    if (activeTab === 'subs') loadSubs();
    if (activeTab === 'content') loadContent();
  };
});

/* ---------- Geschäfte ---------- */
function bizHtml(b) {
  const status = b.active
    ? '<span class="adm-status on">aktiv</span>'
    : '<span class="adm-status off">gesperrt</span>';
  const btn = b.active
    ? `<button class="btn danger small" data-toggle="${b.id}" data-to="0">Sperren</button>`
    : `<button class="btn ready small" data-toggle="${b.id}" data-to="1">Entsperren</button>`;
  return `<div class="card adm-biz ${b.active ? '' : 'is-off'}">
    <div class="adm-head">
      <div>
        <strong>${esc(b.name)}</strong> ${status}<br>
        <span class="muted">/${esc(b.slug)} · ${esc(b.email)} · seit ${esc(b.created_at)}</span>
      </div>
      ${btn}
    </div>
    <div class="adm-stats">
      <span>Heute: <strong>${b.waiting}</strong> wartend · <strong>${b.ready}</strong> bereit · <strong>${b.served_today}</strong> bedient</span>
      <span>Tickets gesamt: <strong>${b.tickets_total}</strong></span>
      <span>Mitarbeiter: <strong>${b.employees}</strong></span>
      <span>Logo: <strong>${b.has_logo ? 'ja' : 'nein'}</strong></span>
      <span><a href="/b/${encodeURIComponent(b.slug)}" target="_blank">Kundenseite</a> ·
            <a href="/b/${encodeURIComponent(b.slug)}/staff" target="_blank">Dashboard</a></span>
    </div>
  </div>`;
}

async function refresh() {
  try {
    const d = await api('/api/admin/overview');
    $('bizCount').textContent = `(${d.count})`;
    $('bizList').innerHTML = d.businesses.length
      ? d.businesses.map(bizHtml).join('')
      : '<div class="card empty">Noch keine Geschäfte registriert.</div>';
    document.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await api(`/api/admin/business/${btn.dataset.toggle}/active`, {
            method: 'POST',
            body: JSON.stringify({ active: btn.dataset.to === '1' }),
          });
        } catch { /* nächster Refresh korrigiert */ }
        refresh();
      };
    });
    // Badge fuer neue Anfragen mit aktualisieren
    api('/api/admin/inquiries').then((d) => {
      const n = d.counts.neu || 0;
      $('inqBadge').textContent = n;
      $('inqBadge').classList.toggle('hidden', n === 0);
    }).catch(() => {});
  } catch (ex) {
    if (String(ex.message).includes('401') || String(ex.message).includes('Admin')) location.reload();
  }
}

/* ---------- Anfragen ---------- */
let inqFilter = '';
document.querySelectorAll('.adm-f').forEach((b) => {
  b.onclick = () => {
    inqFilter = b.dataset.f;
    document.querySelectorAll('.adm-f').forEach((x) => x.classList.toggle('active', x === b));
    loadInquiries();
  };
});

const TYPE_LABEL = { allgemein: 'Allgemein', demo: 'Demo-Anfrage', vertrieb: 'Beratung/Abo' };
const STATUS_LABEL = { neu: 'Neu', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt' };

function inqHtml(i) {
  return `<div class="card adm-biz">
    <div class="adm-head">
      <div>
        <strong>${esc(i.name)}</strong> <span class="adm-status ${i.status === 'neu' ? 'off' : 'on'}">${STATUS_LABEL[i.status] || esc(i.status)}</span><br>
        <span class="muted">${TYPE_LABEL[i.type] || esc(i.type)} · ${esc(i.email)}${i.phone ? ' · ' + esc(i.phone) : ''}${i.business_name ? ' · ' + esc(i.business_name) : ''} · ${esc(i.created_at)}</span>
      </div>
    </div>
    <p style="margin:10px 0;white-space:pre-wrap">${esc(i.message)}</p>
    <div class="adm-stats" style="gap:8px">
      <a class="btn ghost small" href="mailto:${encodeURIComponent(i.email)}">Per E-Mail antworten</a>
      ${i.status !== 'in_bearbeitung' ? `<button class="btn ghost small" data-inq="${i.id}" data-st="in_bearbeitung">In Bearbeitung</button>` : ''}
      ${i.status !== 'erledigt' ? `<button class="btn ready small" data-inq="${i.id}" data-st="erledigt">Erledigt</button>` : ''}
      ${i.status === 'erledigt' ? `<button class="btn ghost small" data-inq="${i.id}" data-st="neu">Wieder öffnen</button>` : ''}
    </div>
  </div>`;
}

async function loadInquiries() {
  try {
    const d = await api('/api/admin/inquiries');
    const list = inqFilter ? d.inquiries.filter((i) => i.status === inqFilter) : d.inquiries;
    $('inqList').innerHTML = list.length
      ? list.map(inqHtml).join('')
      : '<div class="card empty">Keine Anfragen in dieser Ansicht.</div>';
    const n = d.counts.neu || 0;
    $('inqBadge').textContent = n;
    $('inqBadge').classList.toggle('hidden', n === 0);
    document.querySelectorAll('[data-inq]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await api(`/api/admin/inquiry/${btn.dataset.inq}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: btn.dataset.st }),
          });
        } catch { /* ignorieren */ }
        loadInquiries();
      };
    });
  } catch { /* nichts */ }
}

/* ---------- Abo-Modelle ---------- */
function planHtml(p) {
  const eur = (p.price_cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 });
  return `<div class="card adm-biz ${p.active ? '' : 'is-off'}">
    <div class="adm-head">
      <div>
        <strong>${esc(p.name)}</strong> ${p.active ? '<span class="adm-status on">aktiv</span>' : '<span class="adm-status off">inaktiv</span>'}
        ${p.highlighted ? '<span class="adm-status on">Beliebt</span>' : ''}<br>
        <span class="muted">${eur} € / ${esc(p.interval_text)} · ${esc(p.slug)} · Sortierung ${p.sort_order}</span>
      </div>
      <button class="btn ${p.active ? 'danger' : 'ready'} small" data-plan-toggle="${p.id}" data-to="${p.active ? 0 : 1}">${p.active ? 'Deaktivieren' : 'Aktivieren'}</button>
    </div>
    <details style="margin-top:10px">
      <summary>Bearbeiten</summary>
      <div class="adm-form" style="margin-top:10px">
        <input type="text" id="pe_name_${p.id}" value="${esc(p.name)}" placeholder="Name">
        <input type="text" id="pe_desc_${p.id}" value="${esc(p.description)}" placeholder="Kurzbeschreibung">
        <div class="adm-row">
          <input type="number" id="pe_price_${p.id}" min="0" step="0.01" value="${(p.price_cents / 100).toFixed(2)}" placeholder="Preis in €">
          <input type="text" id="pe_interval_${p.id}" value="${esc(p.interval_text)}" placeholder="Intervall">
          <input type="number" id="pe_sort_${p.id}" value="${p.sort_order}" placeholder="Reihenfolge">
        </div>
        <textarea id="pe_features_${p.id}" rows="4" placeholder="Leistungen – eine pro Zeile">${esc(p.features)}</textarea>
        <div class="adm-row">
          <input type="text" id="pe_stripe_${p.id}" value="${esc(p.stripe_price_id)}" placeholder="Stripe Price ID (price_…)">
          <input type="text" id="pe_paypal_${p.id}" value="${esc(p.paypal_plan_id)}" placeholder="PayPal Plan ID (P-…)">
        </div>
        <label class="adm-check"><input type="checkbox" id="pe_hl_${p.id}" ${p.highlighted ? 'checked' : ''}> Als „Beliebt“ hervorheben</label>
        <button class="btn primary small" data-plan-save="${p.id}">Speichern</button>
      </div>
    </details>
  </div>`;
}

function planPayload(id) {
  return {
    name: $('pe_name_' + id).value,
    description: $('pe_desc_' + id).value,
    price_cents: Math.round(parseFloat($('pe_price_' + id).value || '0') * 100),
    interval_text: $('pe_interval_' + id).value,
    sort_order: parseInt($('pe_sort_' + id).value || '0', 10),
    features: $('pe_features_' + id).value,
    stripe_price_id: $('pe_stripe_' + id).value,
    paypal_plan_id: $('pe_paypal_' + id).value,
    highlighted: $('pe_hl_' + id).checked,
  };
}

async function loadPlans() {
  try {
    const d = await api('/api/admin/plans');
    $('planList').innerHTML = d.plans.length
      ? d.plans.map(planHtml).join('')
      : '<div class="card empty">Noch keine Abo-Modelle.</div>';
    document.querySelectorAll('[data-plan-toggle]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await api(`/api/admin/plan/${btn.dataset.planToggle}`, {
            method: 'POST',
            body: JSON.stringify({ active: btn.dataset.to === '1' }),
          });
        } catch { /* ignorieren */ }
        loadPlans();
      };
    });
    document.querySelectorAll('[data-plan-save]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await api(`/api/admin/plan/${btn.dataset.planSave}`, {
            method: 'POST',
            body: JSON.stringify(planPayload(btn.dataset.planSave)),
          });
        } catch { /* ignorieren */ }
        loadPlans();
      };
    });
  } catch { /* nichts */ }
}

$('npCreate').onclick = async () => {
  $('npError').textContent = '';
  try {
    await api('/api/admin/plans', {
      method: 'POST',
      body: JSON.stringify({
        name: $('npName').value,
        description: $('npDesc').value,
        price_cents: Math.round(parseFloat($('npPrice').value || '0') * 100),
        interval_text: $('npInterval').value,
        sort_order: parseInt($('npSort').value || '0', 10),
        features: $('npFeatures').value,
        highlighted: $('npHighlight').checked,
      }),
    });
    $('npName').value = ''; $('npDesc').value = ''; $('npPrice').value = '';
    $('npFeatures').value = ''; $('npHighlight').checked = false;
    loadPlans();
  } catch (ex) {
    $('npError').textContent = ex.message;
  }
};

/* ---------- Abos ---------- */
async function loadSubs() {
  try {
    const d = await api('/api/admin/billing');
    $('subList').innerHTML = d.subscriptions.length
      ? d.subscriptions.map((s) => `<div class="card adm-biz">
          <div class="adm-head"><div>
            <strong>${esc(s.business_name)}</strong> <span class="adm-status ${s.status === 'active' ? 'on' : 'off'}">${esc(s.status)}</span><br>
            <span class="muted">${esc(s.plan_name)} · ${esc(s.provider)} · seit ${esc(s.created_at)}${s.current_period_end ? ' · läuft bis ' + esc(s.current_period_end) : ''}</span>
          </div></div>
        </div>`).join('')
      : '<div class="card empty">Noch keine Abos abgeschlossen.</div>';
  } catch { /* nichts */ }
}

/* ---------- Inhalte ---------- */
const CONTENT_KEYS = ['hero_title', 'hero_sub', 'contact_email', 'impressum_name', 'impressum_street',
  'impressum_city', 'impressum_email', 'impressum_phone', 'impressum_verantwortlich', 'datenschutz_stand'];

async function loadContent() {
  try {
    const d = await api('/api/admin/content');
    CONTENT_KEYS.forEach((k) => { $('c_' + k).value = d.content[k] || ''; });
  } catch { /* nichts */ }
  try {
    const c = await api('/api/admin/config');
    $('configStatus').innerHTML =
      `Stripe: Secret Key ${c.stripe.secret_key ? '✅' : '❌ fehlt'} · Webhook Secret ${c.stripe.webhook_secret ? '✅' : '❌ fehlt'}<br>` +
      `PayPal (${esc(c.paypal.env)}): Client ID ${c.paypal.client_id ? '✅' : '❌ fehlt'} · Client Secret ${c.paypal.client_secret ? '✅' : '❌ fehlt'} · Webhook-ID ${c.paypal.webhook_id ? '✅' : '❌ fehlt'}<br>` +
      `<span class="muted" style="font-size:0.85rem">Schlüssel werden als Railway-Umgebungsvariablen hinterlegt. Preis-/Plan-IDs pflegst du direkt am Abo-Modell.</span>`;
  } catch { /* nichts */ }
}

$('contentSave').onclick = async () => {
  $('contentSaved').textContent = '';
  const entries = {};
  CONTENT_KEYS.forEach((k) => { entries[k] = $('c_' + k).value; });
  try {
    await api('/api/admin/content', { method: 'POST', body: JSON.stringify({ entries }) });
    $('contentSaved').textContent = 'Gespeichert ✓';
    setTimeout(() => { $('contentSaved').textContent = ''; }, 3000);
  } catch (ex) {
    $('contentSaved').textContent = ex.message;
  }
};

/* ---------- Start ---------- */
function showDash() {
  $('loginWrap').classList.add('hidden');
  $('dashWrap').classList.remove('hidden');
  refresh();
  setInterval(refresh, 5000);
}

// Bereits eingeloggt?
api('/api/admin/overview').then(showDash).catch(() => {});
