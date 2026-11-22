'use strict';

const $ = (id) => document.getElementById(id);
let pollTimer = null;
let lastWaitingIds = '';

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

// ---------- Login ----------
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    await api('/api/staff/login', {
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
  return `<div class="q-entry ${isReady ? 'is-ready' : ''}">
    <div class="q-num">#${e.number}</div>
    <div class="q-info">
      <div class="q-name">${esc(e.name || 'Guest')}</div>
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

async function refresh() {
  try {
    const d = await api('/api/staff/queue');
    $('dashVenue').textContent = d.venue;
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
    if (String(ex.message).includes('401') || String(ex.message).includes('autorisiert')) {
      location.reload();
    }
  }
}

function showDash() {
  $('loginWrap').classList.add('hidden');
  $('dashWrap').classList.remove('hidden');
  const joinUrl = location.origin + '/';
  $('joinUrl').textContent = joinUrl;
  $('qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(joinUrl);
  api('/api/settings').then((d) => { $('venueInput').value = d.venue; }).catch(() => {});
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

// Bereits eingeloggt?
api('/api/staff/queue').then(showDash).catch(() => {});
