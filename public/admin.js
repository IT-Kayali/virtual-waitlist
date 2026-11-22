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
  } catch (ex) {
    if (String(ex.message).includes('401') || String(ex.message).includes('Admin')) location.reload();
  }
}

function showDash() {
  $('loginWrap').classList.add('hidden');
  $('dashWrap').classList.remove('hidden');
  refresh();
  setInterval(refresh, 5000);
}

// Bereits eingeloggt?
api('/api/admin/overview').then(showDash).catch(() => {});
