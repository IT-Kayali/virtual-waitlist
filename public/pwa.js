'use strict';
// Shared PWA setup. No permission prompt and no subscription without a click.
(() => {
  const slug = (location.pathname.match(/^\/b\/([a-z0-9-]{1,40})/) || [])[1];
  if (!slug) return;
  const id = new URLSearchParams(location.search).get('id');
  const ownerKey = id ? `ql_owner_${slug}_${id}` : null;
  const token = ownerKey && localStorage.getItem(ownerKey);
  const base = `/api/b/${slug}/ticket/${id}/push/`;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installed = !!navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  let state = 'loading', registration, config, subscription, busy = false, ended = false;
  const link = document.createElement('link'); link.rel = 'manifest'; link.href = `/b/${slug}/manifest.webmanifest`; document.head.appendChild(link);
  let installPrompt;
  const installButton = document.getElementById('installBtn');
  const hint = document.getElementById('installHint');
  function installText() {
    if(hint && !installed) {hint.textContent=t(ios?'push_ios_install':'push_install_hint');hint.classList.remove('hidden');}
    if(hint && installed) hint.classList.add('hidden');
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();installPrompt=event;
    if(installButton&&!installed) installButton.classList.remove('hidden');
  });
  if(installButton && !installed && typeof navigator.install==='function') installButton.classList.remove('hidden');
  if(installButton) installButton.onclick=async()=>{
    try {
      if(typeof navigator.install==='function') await navigator.install();
      else if(installPrompt) {const prompt=installPrompt;installPrompt=null;await prompt.prompt();}
      else return;
      installButton.classList.add('hidden');
    } catch {installText();}
  };
  window.addEventListener('appinstalled',()=>{installed=true;installButton?.classList.add('hidden');installText();});
  installText();
  async function api(action, body) {
    const response = await fetch(base+action, {method:'POST',headers:{'Content-Type':'application/json','X-Ticket-Token':token},body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw Error('push request failed');
    return data;
  }
  function refreshText() {
    const button = document.getElementById('notifyBtn'), status = document.getElementById('pushState');
    installText();
    if (!button) return;
    const allowed = ['off','on','error'].includes(state) && registration && config?.enabled && token && !ended;
    button.disabled = busy || !allowed;
    button.textContent = t(state === 'on' ? 'push_disable' : 'push_enable');
    if (status) status.textContent = t('push_'+(ended?'ended':state));
  }
  function change(next) {state=next;refreshText();window.dispatchEvent(new Event('queuepushchange'));}
  const control = {
    get active() {return state==='on';},
    get state() {return state;},
    get canSubscribe() {return !!registration && !!config?.enabled && !['install','unsupported','blocked','unconfigured'].includes(state);},
    prepareSubscription() {
      if(!this.canSubscribe) return Promise.resolve(null);
      // Called directly from the receipt-confirmation gesture, before any await.
      return registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
    },
    refreshText,
    createToken() {return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');},
    finish() {ended=true;change('ended');},
    async toggle() {
      if (busy || ended || !registration || !config?.enabled || !token) return;
      busy=true;refreshText();
      try {
        if (state === 'on' && subscription) {
          await api('unsubscribe',{endpoint:subscription.endpoint});
          // Keep the browser registration: another business's ticket may use it.
          change('off');
        } else {
          // Must be called immediately in the original click handler, without a preceding await.
          const pending = registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
          subscription = await pending;
          await api('subscribe',{subscription:subscription.toJSON(),lang:currentLang});
          change('on');
        }
      } catch {change(Notification.permission==='denied'?'blocked':'error');}
      finally {busy=false;refreshText();}
    },
  };
  window.QueuePush = control;
  async function initialize() {
    if (ios && !installed) {change('install');return;}
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {change('unsupported');return;}
    try {
      const results = await Promise.all([navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}),fetch('/api/push/config',{cache:'no-store'}).then(r=>r.json())]);
      config=results[1];
      registration=await navigator.serviceWorker.ready;
      if (!config.enabled) {change('unconfigured');return;}
      if (Notification.permission==='denied') {change('blocked');return;}
      if (!id) {change('off');return;}
      if (!token) {change('legacy');return;}
      subscription=await registration.pushManager.getSubscription();
      if (subscription) {
        const status=await api('status',{endpoint:subscription.endpoint});
        change(status.subscribed?'on':'off');
      } else change('off');
    } catch {change('error');}
  }
  refreshText(); initialize();
})();
