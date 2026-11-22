'use strict';

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

applyI18n();
renderLangPicker('langPicker');

const $ = (id) => document.getElementById(id);

// Bereits eingeloggt? Dann Konto-Karte zeigen.
api('/api/me').then((d) => {
  $('meCard').classList.remove('hidden');
  $('meName').textContent = d.name;
  $('meGuestLink').value = location.origin + '/b/' + d.slug;
  $('meDashBtn').href = '/b/' + d.slug + '/staff';
  // Demo-Link ausblenden, wenn das eigene Geschaeft das Demo ist – egal, bleibt sichtbar
}).catch(() => {});

$('meLogoutBtn').onclick = async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
};

$('signupForm').onsubmit = async (e) => {
  e.preventDefault();
  $('signupError').textContent = '';
  const btn = $('signupBtn');
  btn.disabled = true;
  btn.textContent = t('signing_up');
  try {
    const d = await api('/api/signup', {
      method: 'POST',
      body: JSON.stringify({
        venue_name: $('suName').value,
        email: $('suEmail').value,
        password: $('suPassword').value,
        pin: $('suPin').value,
      }),
    });
    location.href = '/b/' + d.slug + '/staff';
  } catch (ex) {
    $('signupError').textContent = ex.message;
    btn.disabled = false;
    applyI18n();
  }
};

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = t('logging_in');
  try {
    const d = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('liEmail').value, password: $('liPassword').value }),
    });
    location.href = '/b/' + d.slug + '/staff';
  } catch (ex) {
    $('loginError').textContent = ex.message;
    btn.disabled = false;
    applyI18n();
  }
};
