'use strict';
(() => {
  const slug=(location.pathname.match(/^\/b\/([a-z0-9-]{1,40})/)||[])[1];
  if(!slug) {location.replace('/');return;}
  const $=id=>document.getElementById(id), base=`/api/b/${slug}`, ticketKey=`ql_ticket_${slug}`;
  const fragment=new URLSearchParams(location.hash.slice(1));
  const qr=fragment.has('id')?{id:Number(fragment.get('id')),key:fragment.get('key')}:null;
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);
  let preview=null, checking=false, busy=false, revision=0, debounce;
  const ownerKey=id=>`ql_owner_${slug}_${id}`, pendingKey=id=>`ql_claim_pending_${slug}_${id}`;
  async function api(path,body,token) {
    const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{'X-Ticket-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok) throw Error(data.error||t('claim_failed'));
    return data;
  }
  function credentials() {return qr||{number:Number($('numberInput').value),code:$('codeInput').value};}
  function readPending(id) {
    try {const value=JSON.parse(localStorage.getItem(pendingKey(id))||'null');if(value?.expiresAt>Date.now()&&/^[a-f0-9]{64}$/.test(value.token||''))return value.token;localStorage.removeItem(pendingKey(id));}catch{}
    return null;
  }
  function canRetry() {try{return preview&&(localStorage.getItem(ownerKey(preview.id))||readPending(preview.id));}catch{return false;}}
  function update() {
    const pwa=window.QueuePush, preparing=pwa?.state==='loading', inUse=preview?.claimed&&!canRetry();
    $('claimBtn').disabled=busy||checking||!preview||preparing||inUse;
    $('claimBtn').textContent=t(busy?'claim_connecting':preparing?'claim_preparing':pwa?.canSubscribe?'claim_confirm':'claim_without');
    $('skipBtn').classList.toggle('hidden',!pwa?.canSubscribe||!preview||inUse);
    $('skipBtn').disabled=busy||checking;
    $('iosClaimHint').classList.toggle('hidden',pwa?.state!=='install');
    if(pwa?.state==='install') {$('claimForm').before?.($('installPanel'));$('claimForm').before?.($('iosClaimHint'));}
    $('claimState').textContent=t(checking?'claim_checking':inUse?'claim_in_use':preview?'claim_qr_ready':'claim_check');
    if(qr&&preview) {$('qrNumber').textContent=preview.number;$('qrNumber').style.setProperty('--digits',String(preview.number).length);}
  }
  async function check() {
    const current=++revision;
    preview=null;
    const data=credentials();
    if(!qr&&(!/^[0-9]{1,9}$/.test($('numberInput').value)||$('codeInput').value.replace(/[ -]/g,'').length!==8)) {checking=false;update();return;}
    checking=true;$('claimError').textContent='';update();
    try {
      const result=await api(base+'/claim/preview',data);
      if(current!==revision) return;
      preview=result;$('venueName').textContent=result.venue;
    } catch(error) {if(current===revision)$('claimError').textContent=error.message;}
    finally {if(current===revision){checking=false;update();}}
  }
  async function connect(withNotifications) {
    if(!preview||busy||(preview.claimed&&!canRetry())) return;
    busy=true;$('claimError').textContent='';update();
    try {
      const token=localStorage.getItem(ownerKey(preview.id))||readPending(preview.id)||window.QueuePush.createToken();
      localStorage.setItem(pendingKey(preview.id),JSON.stringify({token,expiresAt:Date.now()+48*3600000}));
      // This call must stay in the submit/click stack, before any await or request.
      const subscription=withNotifications?window.QueuePush.prepareSubscription().catch(()=>null):Promise.resolve(null);
      const data=await api(base+'/claim/connect',{...credentials(),guest_token:token});
      localStorage.setItem(ownerKey(data.ticket.id),token);
      localStorage.setItem(ticketKey,String(data.ticket.id));
      localStorage.removeItem(pendingKey(data.ticket.id));
      const push=await subscription;
      if(push) {
        try {await api(`${base}/ticket/${data.ticket.id}/push/subscribe`,{subscription:push.toJSON(),lang:currentLang},token);}
        catch { /* Ticket remains usable; the next page shows push as off. */ }
      }
      location.assign(`/b/${slug}/ticket?id=${data.ticket.id}`);
    } catch(error) {$('claimError').textContent=error.message;busy=false;update();}
  }
  applyI18n();renderLangPicker('langPicker');
  try {for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i),prefix=`ql_claim_pending_${slug}_`;if(key?.startsWith(prefix))readPending(key.slice(prefix.length));}}catch{}
  $('privacyLink').href=`/b/${slug}/privacy`;
  if(qr) {
    $('manualFields').classList.add('hidden');$('qrNumberWrap').classList.remove('hidden');
    $('numberInput').required=false;$('codeInput').required=false;
  }
  for(const id of ['numberInput','codeInput']) $(id).addEventListener('input',()=>{
    ++revision;preview=null;checking=false;clearTimeout(debounce);$('claimError').textContent='';update();debounce=setTimeout(check,350);
  });
  $('claimForm').onsubmit=event=>{event.preventDefault();connect(!!window.QueuePush?.canSubscribe);};
  $('skipBtn').onclick=()=>connect(false);
  window.addEventListener('queuepushchange',update);
  const originalSetLang=setLang;setLang=lang=>{originalSetLang(lang);update();};
  api(base+'/settings').then(data=>{
    $('venueName').textContent=data.venue;
    if(data.has_logo){$('venueLogo').src=base+'/logo';$('venueLogo').classList.remove('hidden');}
  }).catch(()=>{});
  if(!qr) {
    const existing=localStorage.getItem(ticketKey);
    if(existing) api(base+'/ticket/'+existing,null,localStorage.getItem(ownerKey(existing))).then(data=>{
      if(['waiting','ready'].includes(data.ticket.status)) {$('currentTicketLink').href=`/b/${slug}/ticket?id=${existing}`;$('currentTicketLink').classList.remove('hidden');}
      else {localStorage.removeItem(ticketKey);localStorage.removeItem(ownerKey(existing));}
    }).catch(()=>{});
  }
  update();if(qr) check();
})();
