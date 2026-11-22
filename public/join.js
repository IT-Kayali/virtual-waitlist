'use strict';

// Slug des Geschaefts aus /b/<slug>/... lesen
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

// Lokalname laden
api(BASE + '/settings').then((d) => {
  document.getElementById('venueName').textContent = d.venue;
  if (d.has_logo) {
    const img = document.getElementById('venueLogo');
    img.src = BASE + '/logo';
    img.classList.remove('hidden');
  }
}).catch(() => { location.replace('/'); });

// Schon ein aktives Ticket bei diesem Geschaeft? Direkt weiterleiten.
const existing = localStorage.getItem(TKEY);
if (existing) {
  api(BASE + '/ticket/' + existing, {headers:{'X-Ticket-Token':localStorage.getItem('ql_owner_'+SLUG+'_'+existing)||''}}).then((d) => {
    if (['waiting', 'ready'].includes(d.ticket.status)) {
      location.replace('/b/' + SLUG + '/ticket?id=' + existing);
    } else {
      localStorage.removeItem(TKEY);
    }
  }).catch(() => localStorage.removeItem(TKEY));
}

document.getElementById('joinForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('joinBtn');
  const err = document.getElementById('joinError');
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
