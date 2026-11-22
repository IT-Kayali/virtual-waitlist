'use strict';

const ticketId = new URLSearchParams(location.search).get('id');
if (!ticketId) location.replace('/');

applyI18n();
renderLangPicker('langPicker');

const $ = (id) => document.getElementById(id);
let lastStatus = null;
let notified = false;

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

// Akustisches Signal (WebAudio, kein externes Asset)
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1108, 1318].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
  } catch { /* stumm */ }
}

function alertReady(ticket) {
  if (notified) return;
  notified = true;
  beep();
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(ticket.venue, { body: t('status_ready') });
  }
}

function render(ticket) {
  $('venueName').textContent = ticket.venue;
  $('ticketNumber').textContent = ticket.number;
  const wrap = $('wrap');
  wrap.classList.toggle('is-ready', ticket.status === 'ready');

  if (ticket.status === 'waiting') {
    $('ticketStatus').textContent = t('status_waiting');
    $('ticketStatus').classList.add('pulse');
    $('ticketSub').textContent = ticket.name || '';
    $('statsRow').classList.remove('hidden');
    $('aheadNum').textContent = ticket.ahead;
    $('estNum').textContent = ticket.est_minutes;
  } else if (ticket.status === 'ready') {
    $('ticketStatus').textContent = t('status_ready');
    $('ticketStatus').classList.remove('pulse');
    $('ticketSub').textContent = t('status_ready_sub');
    $('statsRow').classList.add('hidden');
  } else if (ticket.status === 'done') {
    $('ticketStatus').textContent = t('status_done');
    $('ticketStatus').classList.remove('pulse');
    $('ticketSub').textContent = '';
    $('statsRow').classList.add('hidden');
    $('leaveBtn').classList.add('hidden');
  } else {
    $('ticketStatus').textContent = t('status_cancelled');
    $('ticketSub').textContent = '';
    $('statsRow').classList.add('hidden');
    $('leaveBtn').classList.add('hidden');
  }

  if (ticket.status === 'ready' && lastStatus === 'waiting') alertReady(ticket);
  lastStatus = ticket.status;
}

async function poll() {
  try {
    const data = await api('/api/ticket/' + ticketId);
    render(data.ticket);
    if (['done', 'cancelled'].includes(data.ticket.status)) {
      localStorage.removeItem('ql_ticket');
    }
  } catch {
    // Ticket weg oder Server kurz nicht da – beim nächsten Poll erneut versuchen
  }
}

$('notifyBtn').onclick = async () => {
  if (!('Notification' in window)) { $('notifyBtn').textContent = 'Not supported'; return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') $('notifyBtn').textContent = t('notify_on');
};

$('leaveBtn').onclick = async () => {
  try { await api(`/api/ticket/${ticketId}/cancel`, { method: 'POST' }); } catch { /* egal */ }
  localStorage.removeItem('ql_ticket');
  location.href = '/';
};

// Sprache wechseln → Inhalte neu zeichnen
const origSetLang = setLang;
setLang = (lang) => { origSetLang(lang); lastStatus = null; poll(); };

poll();
setInterval(poll, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
