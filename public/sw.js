'use strict';
// Push-only worker. No fetch handler or offline API cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function safeCall(value) {
  return value && /^[a-z0-9-]{1,40}$/.test(value.slug||'') && Number.isSafeInteger(value.id) && value.id>0 &&
    Number.isSafeInteger(value.version) && value.version>0 && /^[a-f0-9]{64}$/.test(value.ack||'');
}
async function acknowledge(notification) {
  const call=notification.data?.call;
  if(!safeCall(call)) return;
  try {
    await fetch(`/api/b/${call.slug}/ticket/${call.id}/ack`,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({version:call.version,ack:call.ack})});
  } catch { /* A failed acknowledgement cannot promise to stop queued reminders. */ }
}
async function rememberNotification(tag,sequence) {
  if(typeof indexedDB==='undefined') return false;
  return new Promise(resolve=>{
    const request=indexedDB.open('queueup-notification-state',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('calls',{keyPath:'tag'});
    request.onerror=()=>resolve(false);request.onblocked=()=>resolve(false);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('calls','readwrite'),store=tx.objectStore('calls');let duplicate=false;
      const read=store.get(tag);
      read.onsuccess=()=>{const old=read.result;duplicate=!!old&&old.expiresAt>Date.now()&&old.sequence>=sequence;store.put({tag,sequence:Math.max(sequence,old?.sequence??-1),expiresAt:Date.now()+48*3600000});};
      const cursor=store.openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(item){if(item.value.expiresAt<Date.now())item.delete();item.continue();}};
      tx.oncomplete=()=>{db.close();resolve(duplicate);};
      tx.onerror=tx.onabort=()=>{db.close();resolve(false);};
    };
  });
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data={};
    try {data=event.data?.json()||{};} catch { /* Still show a generic update. */ }
    const valid=data.type==='ready' && /^[a-z0-9-]{1,40}$/.test(data.slug||'') &&
      Number.isSafeInteger(data.id) && data.id>0 && Number.isSafeInteger(data.number) && data.number>0 && Number.isSafeInteger(data.version);
    const fresh=valid && Date.now()<=data.expiresAt;
    const messages={
      de:{called:`Nummer ${data.number} wurde aufgerufen. Bitte das Ticket fuer den aktuellen Status oeffnen.`,update:'Dein Ticket wurde aktualisiert. Bitte den aktuellen Status pruefen.',open:'Ticket oeffnen'},
      en:{called:`Number ${data.number} was called. Open your ticket for its current status.`,update:'Your ticket was updated. Open it to check its current status.',open:'Open ticket'},
      ar:{called:`تم استدعاء الرقم ${data.number}. افتح التذكرة لمعرفة الحالة الحالية.`,update:'تم تحديث تذكرتك. افتحها للتحقق من الحالة الحالية.',open:'افتح التذكرة'},
    };
    const text=messages[data.lang]||messages.en;
    const tag=valid?`queueup-${data.id}-${data.version}`:'queueup-update';
    const sequence=Number.isInteger(data.reminder)?data.reminder:0;
    let duplicate=fresh?await rememberNotification(tag,sequence):false;
    try {
      const previous=self.registration.getNotifications?await self.registration.getNotifications({tag}):[];
      duplicate=duplicate||previous.some(item=>(item.data?.sequence??-1)>=sequence);
    } catch { /* Optional duplicate hint. Every push remains visible. */ }
    const options={body:fresh?text.called:text.update,icon:'/icons/icon-192.png',badge:'/icons/badge.png',tag,
      requireInteraction:true,renotify:!!fresh&&!duplicate,silent:!fresh||duplicate,
      data:{url:valid?`/b/${data.slug}/ticket?id=${data.id}`:'/',sequence,
        ...(safeCall(data)?{call:{slug:data.slug,id:data.id,version:data.version,ack:data.ack}}:{})},
      actions:fresh?[{action:'open',title:text.open}]:[]};
    if(fresh&&!duplicate) options.vibrate=[500,150,500,150,800];
    await self.registration.showNotification(valid?`QueueUp · #${data.number}`:'QueueUp',options);
  })());
});
self.addEventListener('notificationclose',event=>event.waitUntil(acknowledge(event.notification)));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const acknowledgement=acknowledge(event.notification);
    const path=event.notification.data?.url;
    const safe=typeof path==='string'&&/^\/b\/[a-z0-9-]{1,40}\/ticket\?id=\d+$/.test(path);
    const url=new URL(safe?path:'/',self.location.origin).href;
    const navigation=(async()=>{
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of windows) if(client.url===url&&'focus' in client) return client.focus();
      return self.clients.openWindow(url);
    })();
    await Promise.all([acknowledgement,navigation]);
  })());
});
