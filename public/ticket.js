'use strict';

const SLUG = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];
if (!SLUG) location.replace('/');
const TKEY = 'ql_ticket_' + SLUG;
const BASE = '/api/b/' + encodeURIComponent(SLUG);
const ticketId = new URLSearchParams(location.search).get('id');
if (!ticketId) location.replace('/b/' + SLUG);
const ownerKey = 'ql_owner_'+SLUG+'_'+ticketId;
const ownerToken = localStorage.getItem?.(ownerKey) || '';
applyI18n();
renderLangPicker('langPicker');
const $ = (id) => document.getElementById(id);
let currentTicket = null;
let almostNotified = false;
let readyShown = false;
let readyAcknowledged = false;
let readyNotificationSent = false;
let notificationFailed = false;
let audioContext = null;
let beepTimer = null;
let polling = false;
$('privacyLink').href = '/b/' + SLUG + '/privacy';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(ownerToken?{'X-Ticket-Token':ownerToken}:{}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

function updateSoundControls() {
  const running = audioContext?.state === 'running';
  $('soundBtn').textContent = t(running ? 'sound_on' : 'sound_enable');
  $('soundState').textContent = t(running ? 'sound_active' : 'sound_inactive');
  if (window.QueuePush) {window.QueuePush.refreshText();return;}
  const supported = 'Notification' in window && !notificationFailed;
  $('notifyBtn').disabled = !supported;
  $('notifyBtn').textContent = t(!supported ? 'notify_unavailable' :
    (Notification.permission === 'granted' ? 'notify_on' : 'notify_btn'));
}

// One reusable context, created/resumed only by a deliberate user gesture.
function playNotes(frequencies, volume = 0.3) {
  if (!audioContext || audioContext.state !== 'running') return false;
  try {
    frequencies.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      const at = audioContext.currentTime + i * 0.2;
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.17);
      oscillator.start(at); oscillator.stop(at + 0.2);
    });
    return true;
  } catch { return false; }
}

async function enableSound(testTone = true) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio unsupported');
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new Audio();
      audioContext.onstatechange = updateSoundControls;
    }
    // Call resume synchronously from the click, before awaiting anything else.
    await audioContext.resume();
    updateSoundControls();
    if (testTone) playNotes([988, 1318], 0.2);
    return audioContext.state === 'running';
  } catch {
    updateSoundControls();
    $('soundState').textContent = t('sound_blocked');
    return false;
  }
}

function stopBeeping() {
  if (beepTimer !== null) { clearInterval(beepTimer); beepTimer = null; }
}
function startBeeping() {
  if (beepTimer !== null || document.hidden) return;
  if (!playNotes([880, 1108, 1318, 1760], 0.4)) {
    updateSoundControls();
    return;
  }
  beepTimer = setInterval(() => {
    if (document.hidden || currentTicket?.status !== 'ready' || readyAcknowledged) {
      stopBeeping(); return;
    }
    if (!playNotes([880, 1108, 1318, 1760], 0.4)) {
      stopBeeping(); updateSoundControls();
    }
  }, 1600);
}
function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* optional */ }
}
function browserNotice(ticket, body, persistent = false) {
  if (window.QueuePush?.active) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    // Some mobile browsers expose Notification but reject its constructor.
    new Notification(ticket.venue, { body, requireInteraction: persistent });
  } catch { notificationFailed = true; updateSoundControls(); }
}
function acknowledgeReady() {
  if (currentTicket?.status === 'ready' && !readyAcknowledged) {
    readyAcknowledged = true;
    stopBeeping();
    vibrate(0);
    $('ticketSub').textContent=t('call_seen');
    if(ownerToken && Number.isSafeInteger(currentTicket.call_version)) api(`${BASE}/ticket/${ticketId}/ack`,{method:'POST',body:JSON.stringify({version:currentTicket.call_version})}).catch(()=>{});
  }
}
window.addEventListener('pointerdown', acknowledgeReady);
window.addEventListener('keydown', acknowledgeReady);

function alertAlmost(ticket) {
  if (almostNotified || document.hidden) return;
  almostNotified = true;
  playNotes([988, 1318], 0.25);
  vibrate([200, 100, 200]);
  browserNotice(ticket, t('status_almost'));
}
function alertReady(ticket) {
  if (readyAcknowledged) return;
  // Best-effort desktop browser notice may work while a tab is hidden.
  // It is not Web Push and must not consume the later in-page alert.
  if (!readyNotificationSent) {
    readyNotificationSent = true;
    browserNotice(ticket, t('status_ready'), true);
  }
  if (document.hidden || readyShown) return;
  readyShown = true;
  startBeeping();
  vibrate([400, 150, 400, 150, 400, 150, 800]);
  document.body.classList.add('flash-ready');
  setTimeout(() => document.body.classList.remove('flash-ready'), 1200);
}

function render(ticket) {
  if (ticket.status === 'ready' && (currentTicket?.status !== 'ready' || ticket.call_version!==currentTicket?.call_version)) {
    readyShown = false;
    readyAcknowledged = !!ticket.call_seen;
    readyNotificationSent = false;
  }
  if(ticket.call_seen) {readyAcknowledged=true;stopBeeping();vibrate(0);}
  currentTicket = ticket;
  $('venueName').textContent = ticket.venue;
  $('ticketNumber').textContent = ticket.number;
  $('ticketNumber').style?.setProperty('--digits',String(ticket.number).length);
  $('wrap').classList.toggle('is-ready', ticket.status === 'ready');
  if (ticket.status !== 'ready') {
    stopBeeping();
    document.body.classList.remove('flash-ready');
  }
  if (ticket.status === 'waiting') {
    const almost = ticket.ahead > 0 && ticket.ahead <= (ticket.notify_ahead ?? 2);
    $('ticketStatus').textContent = t(almost ? 'status_almost' : 'status_waiting');
    $('ticketStatus').classList.add('pulse');
    $('ticketSub').textContent = ticket.name || '';
    $('statsRow').classList.remove('hidden');
    $('leaveBtn').classList.remove('hidden');
    $('aheadNum').textContent = ticket.ahead;
    $('totalNum').textContent = ticket.waiting_total;
    $('estNum').textContent = ticket.est_minutes;
    if (almost) alertAlmost(ticket);
  } else {
    $('ticketStatus').classList.remove('pulse');
    $('statsRow').classList.add('hidden');
    if (ticket.status === 'ready') {
      $('ticketStatus').textContent = t('status_ready');
      $('ticketSub').textContent = t(readyAcknowledged?'call_seen':'status_ready_sub');
      $('leaveBtn').classList.remove('hidden');
      // Also alert on first load if it is already ready.
      alertReady(ticket);
    } else {
      $('ticketStatus').textContent = t(ticket.status === 'done' ? 'status_done' : 'status_cancelled');
      $('ticketSub').textContent = '';
      $('leaveBtn').classList.add('hidden');
      window.QueuePush?.finish();
      localStorage.removeItem(ownerKey);
    }
  }
}
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const data = await api(BASE + '/ticket/' + ticketId);
    render(data.ticket);
    $('connectionHint').textContent = '';
    if (['done', 'cancelled'].includes(data.ticket.status)) localStorage.removeItem(TKEY);
  } catch { $('connectionHint').textContent = t('connection_lost'); }
  finally { polling = false; }
}
$('soundBtn').onclick = () => enableSound(true);
$('notifyBtn').onclick = async () => {
  if (window.QueuePush) return window.QueuePush.toggle();
  const sound = enableSound(false);
  try {
    if ('Notification' in window) await Notification.requestPermission();
  } catch { notificationFailed = true; }
  await sound;
  updateSoundControls();
};
$('leaveBtn').onclick = async () => {
  try { await api(`${BASE}/ticket/${ticketId}/cancel`, { method: 'POST' }); } catch { /* retry via own ticket */ return; }
  localStorage.removeItem(TKEY);
  localStorage.removeItem(ownerKey);
  location.href = '/b/' + SLUG;
};
const origSetLang = setLang;
setLang = (lang) => {
  origSetLang(lang);
  updateSoundControls();
  if (currentTicket) render(currentTicket);
  poll();
};
updateSoundControls();
poll();
setInterval(poll, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopBeeping(); readyShown = false; }
  else { updateSoundControls(); poll(); }
});
window.addEventListener('pageshow', () => { updateSoundControls(); poll(); });
api(BASE + '/settings').then((data) => {
  if (data.has_logo) {
    $('venueLogo').src = BASE + '/logo';
    $('venueLogo').classList.remove('hidden');
  }
}).catch(() => {});
