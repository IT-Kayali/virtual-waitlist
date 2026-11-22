'use strict';
/* QueueUp – oeffentliche Webseite: gemeinsame Helfer (Navigation, Inhalte, Footer) */

async function siteApi(path, options = {}) {
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

/* Inhalte aus /api/public/content in Elemente mit data-content="schluessel" fuellen.
   data-content-html erlaubt Zeilenumbrueche (-> <br>). */
async function loadSiteContent() {
  let content = {};
  try { content = await siteApi('/api/public/content'); } catch { content = {}; }
  document.querySelectorAll('[data-content]').forEach((el) => {
    const k = el.getAttribute('data-content');
    if (content[k] !== undefined && content[k] !== '') el.textContent = content[k];
  });
  document.querySelectorAll('[data-content-html]').forEach((el) => {
    const k = el.getAttribute('data-content-html');
    if (content[k] !== undefined && content[k] !== '') {
      el.innerHTML = esc(content[k]).replace(/\n/g, '<br>');
    }
  });
  return content;
}

function markActiveNav() {
  const here = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.site-nav-links a[href]').forEach((a) => {
    const p = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (p === here) a.classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  markActiveNav();
  loadSiteContent();
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});
