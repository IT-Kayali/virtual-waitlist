'use strict';
// Push-only worker. Deliberately no fetch handler and no offline API cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try {data=event.data?.json() || {};} catch { /* A visible generic update still follows. */ }
    const valid = data.type==='ready' && /^[a-z0-9-]{1,40}$/.test(data.slug || '') &&
      Number.isSafeInteger(data.id) && data.id>0 && Number.isSafeInteger(data.number) && data.number>0;
    const messages = {
      de:{called:`Nummer ${data.number} wurde aufgerufen. Ticket für den aktuellen Status öffnen.`,update:'Dein Ticket wurde aktualisiert. Bitte den aktuellen Status pruefen.'},
      en:{called:`Number ${data.number} was called. Open your ticket for its current status.`,update:'Your ticket was updated. Open it to check its current status.'},
      ar:{called:`تم استدعاء الرقم ${data.number}. افتح التذكرة لمعرفة الحالة الحالية.`,update:'تم تحديث تذكرتك. افتحها للتحقق من الحالة الحالية.'},
    };
    const text = messages[data.lang] || messages.en;
    // Past tense is deliberate: an accepted push cannot be recalled after pickup.
    // Every push must show a notification, including late or malformed payloads.
    await self.registration.showNotification('QueueUp', {
      body:valid && Date.now()<=data.expiresAt?text.called:text.update,
      icon:'/icons/icon-192.png',badge:'/icons/badge.png',
      tag:valid?`queueup-${data.id}-${data.version}`:'queueup-update',renotify:false,
      data:{url:valid?`/b/${data.slug}/ticket?id=${data.id}`:'/'},
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = event.notification.data?.url;
    const safe = typeof path==='string' && /^\/b\/[a-z0-9-]{1,40}\/ticket\?id=\d+$/.test(path);
    const url = new URL(safe?path:'/',self.location.origin).href;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) if (client.url===url && 'focus' in client) return client.focus();
    return self.clients.openWindow(url);
  })());
});
