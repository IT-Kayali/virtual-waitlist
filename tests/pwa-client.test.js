'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function harness({ios=false,token='1'.repeat(64),denied=false}={}) {
 const elements=new Map(),calls={register:0,subscribe:0,api:[]};
 const el=id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){}},textContent:'',disabled:false});return elements.get(id);};
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',toJSON(){return {endpoint:this.endpoint,keys:{}};}};
 const registration={pushManager:{subscribe:()=>{calls.subscribe++;return Promise.resolve(subscription);},getSubscription:async()=>null}};
 const context={location:{pathname:'/b/demo/ticket',search:'?id=1'},URLSearchParams,Uint8Array,Event:class{},
 navigator:{userAgent:ios?'iPhone':'Chrome',serviceWorker:{register:async()=>{calls.register++;return registration;},ready:Promise.resolve(registration)}},
 localStorage:{getItem:()=>token},document:{createElement:()=>({}),head:{appendChild(){}},getElementById:el},
 Notification:{permission:denied?'denied':'default'},PushManager:class{},isSecureContext:true,
 matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){},currentLang:'de',t:k=>k,
 fetch:async(url,options)=>{if(String(url)==='/api/push/config')return {json:async()=>({enabled:true,publicKey:'fixture'})};calls.api.push({url,options});return {ok:true,json:async()=>({subscribed:true})};}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('public/pwa.js','utf8'),context);
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 return {control:context.QueuePush,calls,el};
}
test('Permission is never requested on load; subscribe starts synchronously on an explicit click',async()=>{
 const h=await harness();assert.equal(h.calls.register,1);assert.equal(h.calls.subscribe,0);assert.equal(h.el('notifyBtn').disabled,false);
 const pending=h.control.toggle();assert.equal(h.calls.subscribe,1,'no await may precede the gesture-bound subscribe call');await pending;
 assert.equal(h.control.active,true);assert.match(h.calls.api[0].url,/push\/subscribe$/);
 assert.equal(h.calls.api[0].options.headers['X-Ticket-Token'],'1'.repeat(64));
 await h.control.toggle();assert.equal(h.control.active,false);assert.match(h.calls.api[1].url,/push\/unsubscribe$/);
 h.control.finish();assert.equal(h.el('notifyBtn').disabled,true);
});
test('iOS installation, old-ticket ownership and blocked permissions have explicit safe states',async()=>{
 const ios=await harness({ios:true});assert.equal(ios.calls.subscribe,0);assert.equal(ios.el('pushState').textContent,'push_install');assert.equal(ios.el('notifyBtn').disabled,true);
 const old=await harness({token:null});assert.equal(old.el('pushState').textContent,'push_legacy');assert.equal(old.calls.subscribe,0);
 const blocked=await harness({denied:true});assert.equal(blocked.el('pushState').textContent,'push_blocked');assert.equal(blocked.calls.subscribe,0);
});
