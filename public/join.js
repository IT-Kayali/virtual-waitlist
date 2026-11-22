'use strict';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

applyI18n();
renderLangPicker('langPicker');

// Lokalname laden
api('/api/settings').then((d) => { document.getElementById('venueName').textContent = d.venue; }).catch(() => {});

// Schon ein aktives Ticket? Direkt weiterleiten.
const existing = localStorage.getItem('ql_ticket');
if (existing) {
  api('/api/ticket/' + existing).then((d) => {
    if (['waiting', 'ready'].includes(d.ticket.status)) {
      location.replace('/ticket?id=' + existing);
    } else {
      localStorage.removeItem('ql_ticket');
    }
  }).catch(() => localStorage.removeItem('ql_ticket'));
}

document.getElementById('joinForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('joinBtn');
  const err = document.getElementById('joinError');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = t('joining');
  try {
    const data = await api('/api/join', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('nameInput').value,
        note: document.getElementById('noteInput').value,
      }),
    });
    localStorage.setItem('ql_ticket', data.ticket.id);
    location.href = '/ticket?id=' + data.ticket.id;
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    applyI18n();
  }
};
