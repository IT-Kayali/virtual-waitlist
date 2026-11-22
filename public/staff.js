'use strict';

const SLUG = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];
if (!SLUG) location.replace('/');
const BASE = '/api/b/' + encodeURIComponent(SLUG);

const $ = (id) => document.getElementById(id);
let pollTimer = null;
let lastWaitingIds = '';
let sessionKind = 'pin';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function waitMinutes(isoUtc) {
  const created = new Date(isoUtc.replace(' ', 'T') + 'Z');
  return Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 988;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch { /* stumm */ }
}

// ---------- Login (Geschaefts-PIN oder Mitarbeiter-PIN) ----------
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    await api(BASE + '/staff/login', {
      method: 'POST',
      body: JSON.stringify({ pin: $('pinInput').value }),
    });
    showDash();
  } catch (ex) {
    $('loginError').textContent = ex.message;
  }
};

$('logoutBtn').onclick = async () => {
  await api('/api/staff/logout', { method: 'POST' });
  location.reload();
};

// ---------- Dashboard ----------
function entryHtml(e, isReady) {
  const actions = isReady
    ? `<button class="btn ready small" data-act="done" data-id="${e.id}">Picked up ✓</button>
       <button class="btn ghost small" data-act="waiting" data-id="${e.id}">Back to queue</button>`
    : `<button class="btn primary small" data-act="ready" data-id="${e.id}">Ready 🔔</button>
       <button class="btn danger small" data-act="cancelled" data-id="${e.id}">Cancel</button>`;
  const src = e.source === 'counter' ? '<span class="src-badge">counter</span>' : '';
  return `<div class="q-entry ${isReady ? 'is-ready' : ''}">
    <div class="q-num">#${e.number}</div>
    <div class="q-info">
      <div class="q-name">${esc(e.name || 'Guest')} ${src}</div>
      ${e.note ? `<div class="q-note">${esc(e.note)}</div>` : ''}
      <div class="q-wait">${isReady ? 'called' : `waiting ${waitMinutes(e.created_at)} min`}</div>
    </div>
    <div class="q-actions">${actions}</div>
  </div>`;
}

function bindActions() {
  document.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await api(`/api/staff/entry/${b.dataset.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: b.dataset.act }),
        });
      } catch { /* nächster Poll korrigiert */ }
      refresh();
    };
  });
}

function applyKind(kind, employee) {
  sessionKind = kind || sessionKind;
  const isOwner = sessionKind === 'owner';
  $('billingCard').classList.toggle('hidden', !isOwner);
  $('pinCard').classList.toggle('hidden', !isOwner);
  $('notifCard').classList.toggle('hidden', !isOwner);
  $('empCard').classList.toggle('hidden', !isOwner);
  $('reportCard').classList.toggle('hidden', !isOwner);
  $('whoami').textContent = sessionKind === 'owner' ? 'Owner'
    : sessionKind === 'employee' && employee ? `Employee: ${employee}` : '';
  if (isOwner) { loadEmployees(); loadReport(); }
}

async function refresh() {
  try {
    const d = await api('/api/staff/queue');
    $('dashVenue').textContent = d.venue;
    applyKind(d.kind, d.employee);
    $('statWaiting').textContent = d.stats.waiting;
    $('statReady').textContent = d.stats.ready;
    $('statServed').textContent = d.stats.served;
    $('statAvg').textContent = d.stats.avg_minutes;
    $('waitingList').innerHTML = d.waiting.length
      ? d.waiting.map((e) => entryHtml(e, false)).join('')
      : '<div class="empty">Queue is empty.</div>';
    $('readyList').innerHTML = d.ready.length
      ? d.ready.map((e) => entryHtml(e, true)).join('')
      : '<div class="empty">Nothing waiting for pickup.</div>';
    bindActions();
    // Ton, wenn ein neuer Gast dazukommt
    const ids = d.waiting.map((e) => e.id).join(',');
    if (lastWaitingIds && ids !== lastWaitingIds) {
      const oldSet = new Set(lastWaitingIds.split(','));
      if (d.waiting.some((e) => !oldSet.has(String(e.id)))) beep();
    }
    lastWaitingIds = ids;
  } catch (ex) {
    if (String(ex.message).includes('401') || String(ex.message).includes('angemeldet')) {
      location.reload();
    }
  }
}

function showDash() {
  $('loginWrap').classList.add('hidden');
  $('dashWrap').classList.remove('hidden');
  const joinUrl = location.origin + '/b/' + SLUG;
  const kioskUrl = joinUrl + '/kiosk';
  $('joinUrl').textContent = joinUrl;
  $('qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(joinUrl);
  $('kioskUrl').textContent = kioskUrl;
  $('qrKioskImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(kioskUrl);
  api('/api/staff/queue').then((d) => {
    $('venueInput').value = d.venue;
    applyKind(d.kind, d.employee);
    if (d.notify_ahead != null) $('notifyAheadInput').value = d.notify_ahead;
    if (d.has_logo) {
      $('logoPreview').src = BASE + '/logo';
      $('logoPreview').classList.remove('hidden');
      $('removeLogoBtn').classList.remove('hidden');
    }
  }).catch(() => {});
  refresh();
  pollTimer = setInterval(refresh, 3000);
}

$('addForm').onsubmit = async (e) => {
  e.preventDefault();
  await api('/api/staff/add', {
    method: 'POST',
    body: JSON.stringify({ name: $('addName').value, note: $('addNote').value }),
  });
  $('addName').value = '';
  $('addNote').value = '';
  refresh();
};

$('saveVenueBtn').onclick = async () => {
  const d = await api('/api/staff/settings', {
    method: 'POST',
    body: JSON.stringify({ venue_name: $('venueInput').value }),
  });
  $('dashVenue').textContent = d.venue;
};

$('savePinBtn').onclick = async () => {
  $('pinMsg').textContent = '';
  try {
    await api('/api/staff/settings', {
      method: 'POST',
      body: JSON.stringify({ new_pin: $('pinNewInput').value }),
    });
    $('pinNewInput').value = '';
    $('pinMsg').textContent = 'PIN changed ✓';
  } catch (ex) {
    $('pinMsg').textContent = ex.message;
  }
};

$('saveNotifyBtn').onclick = async () => {
  $('notifyMsg').textContent = '';
  try {
    await api('/api/staff/settings', {
      method: 'POST',
      body: JSON.stringify({ notify_ahead: Number($('notifyAheadInput').value) }),
    });
    $('notifyMsg').textContent = 'Saved ✓';
  } catch (ex) {
    $('notifyMsg').textContent = ex.message;
  }
};

// ---------- Logo ----------
$('saveLogoBtn').onclick = async () => {
  $('logoMsg').textContent = '';
  const file = $('logoInput').files[0];
  if (!file) { $('logoMsg').textContent = 'Choose an image file first.'; return; }
  if (file.size > 2 * 1024 * 1024) { $('logoMsg').textContent = 'Max. 2 MB.'; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api('/api/staff/logo', { method: 'POST', body: JSON.stringify({ data: reader.result }) });
      $('logoPreview').src = BASE + '/logo?' + Date.now();
      $('logoPreview').classList.remove('hidden');
      $('removeLogoBtn').classList.remove('hidden');
      $('logoMsg').textContent = 'Logo saved ✓';
    } catch (ex) { $('logoMsg').textContent = ex.message; }
  };
  reader.readAsDataURL(file);
};

$('removeLogoBtn').onclick = async () => {
  try {
    await api('/api/staff/logo/remove', { method: 'POST' });
    $('logoPreview').classList.add('hidden');
    $('removeLogoBtn').classList.add('hidden');
    $('logoMsg').textContent = 'Logo removed.';
  } catch (ex) { $('logoMsg').textContent = ex.message; }
};

// ---------- Mitarbeiter (Inhaber) ----------
async function loadEmployees() {
  try {
    const d = await api('/api/staff/employees');
    $('empList').innerHTML = d.employees.length
      ? d.employees.map((e) => `<div class="emp-row">
          <span>${esc(e.name)}</span>
          <button class="btn danger small" data-emp-del="${e.id}">Remove</button>
        </div>`).join('')
      : '<div class="empty">No employees yet.</div>';
    document.querySelectorAll('[data-emp-del]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try { await api(`/api/staff/employees/${b.dataset.empDel}/remove`, { method: 'POST' }); } catch { /* egal */ }
        loadEmployees();
        loadReport();
      };
    });
  } catch { /* kein Inhaber */ }
}

$('empForm').onsubmit = async (e) => {
  e.preventDefault();
  $('empError').textContent = '';
  try {
    await api('/api/staff/employees', {
      method: 'POST',
      body: JSON.stringify({ name: $('empName').value, pin: $('empPin').value }),
    });
    $('empName').value = '';
    $('empPin').value = '';
    loadEmployees();
    loadReport();
  } catch (ex) { $('empError').textContent = ex.message; }
};

// ---------- Report (Inhaber) ----------
async function loadReport() {
  try {
    const d = await api('/api/staff/reports');
    $('reportBody').innerHTML = d.employees.length
      ? d.employees.map((e) => `<tr>
          <td>${esc(e.name)}</td><td>${e.ready_count}</td><td>${e.done_count}</td>
          <td>${e.avg_ready_min != null ? e.avg_ready_min : '–'}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="empty">No employees yet.</td></tr>';
    $('reportUnattr').textContent = d.unattributed_ready
      ? `${d.unattributed_ready} order(s) marked ready without employee login (business PIN).`
      : '';
  } catch { /* kein Inhaber */ }
}

// Bereits eingeloggt? Session muss zu DIESEM Geschaeft gehoeren.
api('/api/me').then((d) => {
  if (d.slug === SLUG) {
    showDash();
  } else {
    // Session gehoert zu einem anderen Geschaeft -> abmelden und PIN-Login zeigen
    api('/api/staff/logout', { method: 'POST' }).finally(() => {
      $('loginWrap').classList.remove('hidden');
    });
  }
}).catch(() => { /* PIN-Login zeigen */ });
