'use strict';

// Tresen-/Kiosk-Bildschirm: Kunde scannt, Personal traegt die Bestellung ein.
const SLUG = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];
if (!SLUG) location.replace('/');
const TKEY = 'ql_ticket_' + SLUG;
const BASE = '/api/b/' + encodeURIComponent(SLUG);

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

applyI18n();
renderLangPicker('langPicker');
document.getElementById('privacyLink').href = '/b/' + SLUG + '/privacy';

api(BASE + '/settings').then((d) => {
  document.getElementById('venueName').textContent = d.venue;
  if (d.has_logo) {
    const img = document.getElementById('venueLogo');
    img.src = BASE + '/logo';
    img.classList.remove('hidden');
  }
}).catch(() => { location.replace('/'); });

// Kein Auto-Redirect auf ein altes Ticket: Am Tresen soll jeder Scan neu starten.
// (Das eigene Ticket des Kunden liegt nach dem Anlegen auf seinem Geraet.)

document.getElementById('kioskForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('kioskBtn');
  const err = document.getElementById('kioskError');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = t('joining');
  try {
    const guestToken = window.QueuePush.createToken();
    const data = await api(BASE + '/join', {
      method: 'POST',
      body: JSON.stringify({
        guest_token: guestToken,
        name: document.getElementById('nameInput').value,
        note: document.getElementById('noteInput').value,
        source: 'counter',
      }),
    });
    localStorage.setItem('ql_owner_' + SLUG + '_' + data.ticket.id, guestToken);
    localStorage.setItem(TKEY, data.ticket.id);
    location.href = '/b/' + SLUG + '/ticket?id=' + data.ticket.id;
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    applyI18n();
  }
};
