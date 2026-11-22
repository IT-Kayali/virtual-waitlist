'use strict';

// Datenschutz-Seite: Geschaeftsname einsetzen, wenn ueber /b/<slug>/privacy aufgerufen.
const SLUG = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];

applyI18n();
renderLangPicker('langPicker');

if (SLUG) {
  fetch('/api/b/' + encodeURIComponent(SLUG) + '/settings')
    .then((r) => r.json())
    .then((d) => {
      if (d.venue) {
        document.getElementById('venueName').textContent = d.venue;
        document.getElementById('backLink').href = '/b/' + SLUG;
      }
    })
    .catch(() => {});
}
