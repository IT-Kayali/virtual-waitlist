'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness() {
 const events=new Map(),notices=[],opened=[],focused=[],requests=[];
 const self={location:{origin:'https://queueup.test.invalid'},addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>{},
 registration:{showNotification:async(title,options)=>notices.push({title,...options})},
 clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 const context={self,URL,Date,fetch:async(url,options)=>{requests.push({url,options});return {ok:true};}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/sw.js','utf8'),context);
 async function fire(name,fields){const pending=[];events.get(name)({...fields,waitUntil:p=>pending.push(p)});await Promise.all(pending);}
 return {self,events,notices,opened,focused,requests,fire};
}
test('Worker displays every push immediately, without a network fetch or API cache',async()=>{
 const h=harness();assert.equal(h.events.has('fetch'),false);
 await h.fire('push',{data:{json:()=>({type:'ready',slug:'demo',id:12,number:7,version:1,lang:'de',expiresAt:Date.now()+60000})}});
 assert.equal(h.notices.length,1);assert.match(h.notices[0].body,/7 wurde aufgerufen/);assert.equal(h.notices[0].data.url,'/b/demo/ticket?id=12');assert.equal(h.notices[0].renotify,true);assert.equal(h.notices[0].requireInteraction,true);assert.ok(h.notices[0].vibrate.length>0);
 await h.fire('push',{data:{json:()=>{throw Error('fixture');}}});assert.equal(h.notices.length,2);
 await h.fire('push',{data:{json:()=>({type:'ready',slug:'demo',id:12,number:7,expiresAt:0})}});
 assert.equal(h.notices.length,3);assert.equal(h.notices[2].body.includes('was called'),false);
});
test('Repeated notifications alert again, duplicates stay quiet, and dismissal acknowledges only a scoped call',async()=>{
 const h=harness(),data={type:'ready',slug:'demo',id:12,number:7,version:1,lang:'de',reminder:1,ack:'a'.repeat(64),expiresAt:Date.now()+60000};
 await h.fire('push',{data:{json:()=>data}});assert.equal(h.notices[0].renotify,true);
 h.self.registration.getNotifications=async()=>[{data:{sequence:1}}];
 await h.fire('push',{data:{json:()=>data}});assert.equal(h.notices[1].silent,true);assert.equal(h.notices[1].renotify,false);assert.equal('vibrate' in h.notices[1],false);
 await h.fire('notificationclose',{notification:{data:h.notices[0].data}});assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/b/demo/ticket/12/ack');
 assert.deepEqual(JSON.parse(h.requests[0].options.body),{version:1,ack:'a'.repeat(64)});
 await h.fire('notificationclose',{notification:{data:{call:{...data,slug:'../other'}}}});assert.equal(h.requests.length,1);
});

test('Notification clicks only open a validated same-origin ticket or the home page',async()=>{
 const h=harness();let closed=0;
 await h.fire('notificationclick',{notification:{data:{url:'https://evil.invalid/path'},close:()=>closed++}});
 assert.equal(h.opened[0],'https://queueup.test.invalid/');
 await h.fire('notificationclick',{notification:{data:{url:'/b/demo/ticket?id=12'},close:()=>closed++}});
 assert.equal(h.opened[1],'https://queueup.test.invalid/b/demo/ticket?id=12');assert.equal(closed,2);
 h.self.clients.matchAll=async()=>[{url:'https://queueup.test.invalid/b/demo/ticket?id=12',focus:async()=>h.focused.push(true)}];
 await h.fire('notificationclick',{notification:{data:{url:'/b/demo/ticket?id=12'},close:()=>{}}});assert.equal(h.focused.length,1);assert.equal(h.opened.length,2);
});
