'use strict';
/* Mini-i18n: Sprachdateien + t(). Neue Sprachen = neuer Eintrag in LANGS. */
const LANGS = {
  en: {
    join_title: 'Join the queue',
    join_sub: 'No app, no signup. Enter your name and we\'ll show your number.',
    your_name: 'Your name (optional)',
    your_note: 'Order / note (optional)',
    name_ph: 'e.g. Alex',
    note_ph: 'e.g. 2 cappuccino, 1 croissant',
    join_btn: 'Join the queue',
    joining: 'Joining…',
    your_number: 'Your number',
    status_waiting: 'Please wait — we\'ll call your number.',
    status_ready: 'Your order is ready! 🎉',
    status_ready_sub: 'Please pick it up at the counter.',
    status_done: 'Picked up — enjoy!',
    status_cancelled: 'This ticket was cancelled.',
    ahead: 'Ahead of you',
    est_wait: 'Est. wait',
    minutes: 'min',
    notify_btn: '🔔 Notify me on this device',
    notify_on: 'Notifications on ✓',
    leave_btn: 'Leave the queue',
    updates_auto: 'This page updates automatically.',
    left_queue: 'You left the queue.',
    join_again: 'Join again',
  },
  de: {
    join_title: 'In die Warteschlange einreihen',
    join_sub: 'Keine App, keine Anmeldung. Name eingeben und Nummer erhalten.',
    your_name: 'Dein Name (optional)',
    your_note: 'Bestellung / Notiz (optional)',
    name_ph: 'z. B. Alex',
    note_ph: 'z. B. 2 Cappuccino, 1 Croissant',
    join_btn: 'Einreihen',
    joining: 'Einen Moment…',
    your_number: 'Deine Nummer',
    status_waiting: 'Bitte warten – wir rufen deine Nummer auf.',
    status_ready: 'Deine Bestellung ist fertig! 🎉',
    status_ready_sub: 'Bitte am Tresen abholen.',
    status_done: 'Abgeholt – guten Appetit!',
    status_cancelled: 'Dieses Ticket wurde storniert.',
    ahead: 'Vor dir',
    est_wait: 'Wartezeit ca.',
    minutes: 'Min.',
    notify_btn: '🔔 Auf diesem Gerät benachrichtigen',
    notify_on: 'Benachrichtigung an ✓',
    leave_btn: 'Warteschlange verlassen',
    updates_auto: 'Diese Seite aktualisiert sich automatisch.',
    left_queue: 'Du hast die Warteschlange verlassen.',
    join_again: 'Erneut einreihen',
  },
  ar: {
    join_title: 'انضم إلى قائمة الانتظار',
    join_sub: 'بدون تطبيق وبدون تسجيل. أدخل اسمك واحصل على رقمك.',
    your_name: 'اسمك (اختياري)',
    your_note: 'الطلب / ملاحظة (اختياري)',
    name_ph: 'مثال: أحمد',
    note_ph: 'مثال: ٢ كابتشينو وكرواسون',
    join_btn: 'انضم الآن',
    joining: 'جارٍ الانضمام…',
    your_number: 'رقمك',
    status_waiting: 'يرجى الانتظار — سننادي على رقمك.',
    status_ready: 'طلبك جاهز! 🎉',
    status_ready_sub: 'يرجى الاستلام من الكاونتر.',
    status_done: 'تم الاستلام — بالهناء والشفاء!',
    status_cancelled: 'تم إلغاء هذا التذكرة.',
    ahead: 'قبلك',
    est_wait: 'الانتظار المتوقع',
    minutes: 'دقيقة',
    notify_btn: '🔔 إشعاري على هذا الجهاز',
    notify_on: 'الإشعارات مفعّلة ✓',
    leave_btn: 'مغادرة قائمة الانتظار',
    updates_auto: 'هذه الصفحة تتحدّث تلقائيًا.',
    left_queue: 'لقد غادرت قائمة الانتظار.',
    join_again: 'انضم مجددًا',
  },
};

function getLang() {
  const url = new URLSearchParams(location.search);
  const fromUrl = url.get('lang');
  if (fromUrl && LANGS[fromUrl]) {
    localStorage.setItem('ql_lang', fromUrl);
    return fromUrl;
  }
  const saved = localStorage.getItem('ql_lang');
  if (saved && LANGS[saved]) return saved;
  return 'en';
}

let currentLang = getLang();

function t(key) {
  return (LANGS[currentLang] && LANGS[currentLang][key]) || LANGS.en[key] || key;
}

function setLang(lang) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  localStorage.setItem('ql_lang', lang);
  applyI18n();
  document.querySelectorAll('.lang-picker button').forEach((b) =>
    b.classList.toggle('active', b.dataset.lang === lang));
}

function applyI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}

function renderLangPicker(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Object.keys(LANGS).map((l) =>
    `<button data-lang="${l}" class="${l === currentLang ? 'active' : ''}">${l.toUpperCase()}</button>`
  ).join('');
  el.querySelectorAll('button').forEach((b) => b.onclick = () => setLang(b.dataset.lang));
}
