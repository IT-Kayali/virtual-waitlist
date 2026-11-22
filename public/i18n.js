'use strict';
/* Mini-i18n: Sprachdateien + t(). Neue Sprachen = neuer Eintrag in LANGS. */
const LANGS = {
  en: {
    notify_unavailable: "Browser notices unavailable",
    sound_enable: "🔊 Enable / test sound",
    sound_on: "🔊 Test sound again",
    sound_active: "Sound is enabled for this open page. Check your volume. Tap to stop a ready alarm.",
    sound_inactive: "Tap Enable / test sound once and check that you hear the test tone.",
    sound_blocked: "Sound could not start. Tap again and check browser permissions and volume.",
    notification_limits: "Keep this ticket open. No reliable alert when the phone is locked or the browser is closed. Vibration depends on your device.",
    connection_lost: "Connection interrupted. Retrying automatically. Keep this page open.",
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
    notify_btn: "Allow browser notices",
    notify_on: "Browser notices allowed",
    leave_btn: 'Leave the queue',
    updates_auto: 'This page updates automatically.',
    left_queue: 'You left the queue.',
    join_again: 'Join again',
    status_almost: 'You are almost up! 🔔',
    in_queue: 'In queue',
    privacy_link: 'Privacy',
    kiosk_badge: 'Counter',
    kiosk_title: 'Almost there!',
    kiosk_sub: 'Please hand your phone to our staff – they will enter your order.',
    kiosk_order: 'Order (filled in by staff)',
    kiosk_btn: 'Create my number',
    // Landing
    landing_title: 'The virtual waitlist for your business',
    landing_sub: 'Guests join via QR code or link, no app needed. You get a live dashboard, your own staff PIN and daily stats.',
    feat_qr: 'QR code & link per business',
    feat_live: 'Live dashboard for your staff',
    feat_stats: 'Daily numbers & wait times',
    signup_title: 'Create your business',
    signup_name: 'Business name',
    signup_email: 'Email',
    signup_password: 'Password (min. 6 characters)',
    signup_pin: 'Staff PIN (4–8 digits)',
    signup_btn: 'Create business',
    signing_up: 'Creating…',
    login_title: 'Log in',
    login_btn: 'Log in',
    logging_in: 'Logging in…',
    demo_link: 'Try the live demo →',
    logged_in_as: 'Logged in as',
    go_dashboard: 'Open dashboard',
    guest_link: 'Guest link (for QR code & invites)',
    logout: 'Log out',
  },
  de: {
    notify_unavailable: "Browserhinweise nicht verfügbar",
    sound_enable: "🔊 Ton aktivieren / testen",
    sound_on: "🔊 Ton erneut testen",
    sound_active: "Ton ist für diese offene Seite aktiviert. Lautstärke prüfen. Tippen stoppt den Fertig-Alarm.",
    sound_inactive: "Einmal auf Ton aktivieren / testen tippen und prüfen, ob du den Testton hörst.",
    sound_blocked: "Ton konnte nicht starten. Erneut tippen, Browserrechte und Lautstärke prüfen.",
    notification_limits: "Ticket geöffnet lassen. Kein verlässlicher Alarm bei gesperrtem Handy oder geschlossenem Browser. Vibration ist geräteabhängig.",
    connection_lost: "Verbindung unterbrochen. Neuer Versuch erfolgt automatisch. Seite geöffnet lassen.",
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
    notify_btn: "Browserhinweise erlauben",
    notify_on: "Browserhinweise erlaubt",
    leave_btn: 'Warteschlange verlassen',
    updates_auto: 'Diese Seite aktualisiert sich automatisch.',
    left_queue: 'Du hast die Warteschlange verlassen.',
    join_again: 'Erneut einreihen',
    status_almost: 'Du bist fast dran! 🔔',
    in_queue: 'In der Schlange',
    privacy_link: 'Datenschutz',
    kiosk_badge: 'Tresen',
    kiosk_title: 'Fast geschafft!',
    kiosk_sub: 'Bitte gib dein Handy kurz unserem Personal – die Bestellung wird für dich eingetragen.',
    kiosk_order: 'Bestellung (wird vom Personal eingetragen)',
    kiosk_btn: 'Meine Nummer erstellen',
    // Landing
    landing_title: 'Die virtuelle Warteliste für dein Geschäft',
    landing_sub: 'Gäste reihen sich per QR-Code oder Link ein – ganz ohne App. Du bekommst ein Live-Dashboard, eine eigene PIN und Tages-Statistiken.',
    feat_qr: 'QR-Code & Link pro Geschäft',
    feat_live: 'Live-Dashboard fürs Personal',
    feat_stats: 'Tagesnummern & Wartezeiten',
    signup_title: 'Geschäft anlegen',
    signup_name: 'Name des Geschäfts',
    signup_email: 'E-Mail',
    signup_password: 'Passwort (min. 6 Zeichen)',
    signup_pin: 'Personal-PIN (4–8 Ziffern)',
    signup_btn: 'Geschäft anlegen',
    signing_up: 'Wird angelegt…',
    login_title: 'Einloggen',
    login_btn: 'Einloggen',
    logging_in: 'Einen Moment…',
    demo_link: 'Live-Demo ansehen →',
    logged_in_as: 'Eingeloggt als',
    go_dashboard: 'Zum Dashboard',
    guest_link: 'Gäste-Link (für QR-Code & Einladungen)',
    logout: 'Ausloggen',
  },
  ar: {
    notify_unavailable: "تنبيهات المتصفح غير متاحة",
    sound_enable: "🔊 تفعيل الصوت واختباره",
    sound_on: "🔊 اختبار الصوت مجددًا",
    sound_active: "الصوت مفعّل لهذه الصفحة المفتوحة. تحقق من مستوى الصوت. المس الشاشة لإيقاف تنبيه الجاهزية.",
    sound_inactive: "اضغط لتفعيل الصوت واختباره وتأكد من سماع نغمة الاختبار.",
    sound_blocked: "تعذر تشغيل الصوت. اضغط مجددًا وتحقق من أذونات المتصفح ومستوى الصوت.",
    notification_limits: "أبقِ التذكرة مفتوحة. لا يوجد تنبيه موثوق عند قفل الهاتف أو إغلاق المتصفح. الاهتزاز يعتمد على الجهاز.",
    connection_lost: "انقطع الاتصال. ستتم إعادة المحاولة تلقائيًا. أبقِ الصفحة مفتوحة.",
    join_title: 'انضم إلى قائمة الانتظار',
    join_sub: 'بدون تطبيق وبدون تسجيل. أدخل اسمك واحصل على رقمك.',
    your_name: 'اسمك (اختياري)',
    your_note: 'الطلب / ملاحظة (اختياري)',
    name_ph: 'مثال: أحمد',
    note_ph: 'مثال: ٢ كابتشينيو وكرواسون',
    join_btn: 'انضم الآن',
    joining: 'جارٍ الانضمام…',
    your_number: 'رقمك',
    status_waiting: 'يرجى الانتظار — سننادي على رقمك.',
    status_ready: 'طلبك جاهز! 🎉',
    status_ready_sub: 'يرجى الاستلام من الكاونتر.',
    status_done: 'تم الاستلام — بالهناء والشفاء!',
    status_cancelled: 'تم إلغاء هذه التذكرة.',
    ahead: 'قبلك',
    est_wait: 'الانتظار المتوقع',
    minutes: 'دقيقة',
    notify_btn: "السماح بتنبيهات المتصفح",
    notify_on: "تنبيهات المتصفح مسموحة",
    leave_btn: 'مغادرة قائمة الانتظار',
    updates_auto: 'هذه الصفحة تتحدّث تلقائيًا.',
    left_queue: 'لقد غادرت قائمة الانتظار.',
    join_again: 'انضم مجددًا',
    status_almost: 'اقترب دورك! 🔔',
    in_queue: 'في الانتظار',
    privacy_link: 'الخصوصية',
    kiosk_badge: 'الكاونتر',
    kiosk_title: 'خطوة أخيرة!',
    kiosk_sub: 'يرجى تسليم هاتفك للموظف – سيقوم بإدخال طلبك.',
    kiosk_order: 'الطلب (يُدخله الموظف)',
    kiosk_btn: 'أنشئ رقمي',
    // Landing
    landing_title: 'قائمة الانتظار الافتراضية لعملك',
    landing_sub: 'ينضم الضيوف عبر رمز QR أو رابط، بدون تطبيق. تحصل على لوحة تحكم مباشرة ورمز PIN خاص وإحصاءات يومية.',
    feat_qr: 'رمز QR ورابط لكل نشاط تجاري',
    feat_live: 'لوحة تحكم مباشرة للموظفين',
    feat_stats: 'أرقام يومية وأوقات انتظار',
    signup_title: 'أنشئ نشاطك التجاري',
    signup_name: 'اسم النشاط التجاري',
    signup_email: 'البريد الإلكتروني',
    signup_password: 'كلمة المرور (٦ أحرف على الأقل)',
    signup_pin: 'رمز PIN للموظفين (٤–٨ أرقام)',
    signup_btn: 'إنشاء النشاط',
    signing_up: 'جارٍ الإنشاء…',
    login_title: 'تسجيل الدخول',
    login_btn: 'دخول',
    logging_in: 'لحظة من فضلك…',
    demo_link: 'جرّب العرض المباشر ←',
    logged_in_as: 'مسجّل الدخول باسم',
    go_dashboard: 'فتح لوحة التحكم',
    guest_link: 'رابط الضيوف (لرمز QR والدعوات)',
    logout: 'تسجيل الخروج',
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
