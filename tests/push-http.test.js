'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
test('HTTP: manifest, capability checks, push opt-in/status/off and ready cancellation',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'queueup-push-http-'));
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'4138',DATA_DIR:dir,STAFF_PIN:'146278',PUBLIC_BASE_URL:'https://queueup.test.invalid',BILLING_MODE:'disabled'}});
 let log='';proc.stdout.on('data',x=>log+=x);proc.stderr.on('data',x=>log+=x);
 const base='http://localhost:4138';
 async function req(p,{body,token,cookie,origin}={}){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{'X-Ticket-Token':token}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
 try {
  for(let n=0;n<80;n++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,50));}}
  assert.equal((await req('/api/b/demo/settings')).data.slug,'demo');
  const manifest=await req('/b/demo/manifest.webmanifest');assert.equal(manifest.status,200);assert.equal(manifest.data.start_url,'/b/demo/');assert.equal(manifest.data.display,'standalone');
  for(const icon of manifest.data.icons)assert.equal((await fetch(base+icon.src)).status,200);
  const sw=await fetch(base+'/sw.js');assert.equal(sw.status,200);assert.equal(sw.headers.get('service-worker-allowed'),'/');assert.equal(sw.headers.get('cache-control'),'no-cache');
  assert.equal((await req('/api/push/config')).data.enabled,true);
  const token='3'.repeat(64),bad='4'.repeat(64);
  const join=await req('/api/b/demo/join',{body:{name:'Secret fixture',note:'Private fixture',guest_token:token}});assert.equal(join.status,200);
  const ticket='/api/b/demo/ticket/'+join.data.ticket.id;
  assert.equal(join.data.ticket.push_eligible,true);assert.equal(JSON.stringify(join.data).includes(token),false);
  assert.equal((await req(ticket)).status,403);assert.equal((await req(ticket,{token:bad})).status,403);
  assert.equal((await req(ticket,{token})).data.ticket.name,'Secret fixture');
  assert.equal((await req(ticket,{token})).headers.get('cache-control'),'no-store');
  assert.equal((await req(ticket+'/cancel',{body:{},token:bad})).status,403);
  const key=crypto.createECDH('prime256v1');key.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/http-fixture',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  assert.equal((await req(ticket+'/push/subscribe',{body:{subscription,lang:'de'}})).status,403);
  assert.equal((await req(ticket+'/push/subscribe',{token,origin:'https://evil.invalid',body:{subscription}})).status,403);
  assert.equal((await req(ticket+'/push/subscribe',{token,body:{subscription:{...subscription,endpoint:'https://127.0.0.1/private'}}})).status,400);
  assert.equal((await req(ticket+'/push/subscribe',{token,body:{subscription,lang:'de'}})).status,200);
  assert.equal((await req(ticket+'/push/status',{token,body:{endpoint:subscription.endpoint}})).data.subscribed,true);
  assert.equal((await req('/api/b/other/ticket/'+join.data.ticket.id+'/push/status',{token,body:{endpoint:subscription.endpoint}})).status,404);
  assert.equal((await req(ticket+'/push/unsubscribe',{token,body:{endpoint:subscription.endpoint}})).data.subscribed,false);
  // No real external push request: subscription is removed before this status change.
  const staff=await req('/api/b/demo/staff/login',{body:{pin:'146278'}});
  assert.equal((await req('/api/staff/queue',{cookie:staff.cookie})).status,200);
  assert.equal((await req('/api/staff/entry/'+join.data.ticket.id+'/status',{cookie:staff.cookie,body:{status:'ready'}})).status,200);
  assert.equal((await req(ticket+'/cancel',{token,body:{}})).status,200);
  assert.equal((await req(ticket,{token})).data.ticket.status,'cancelled');
  const legacy=await req('/api/b/demo/join',{body:{name:'Legacy fixture',note:'Legacy secret'}});
  const old='/api/b/demo/ticket/'+legacy.data.ticket.id;
  assert.equal((await req(old)).data.ticket.name,'');assert.equal((await req(old)).data.ticket.note,'');
  assert.equal((await req(old+'/push/subscribe',{token,body:{subscription}})).status,403);
 } catch(error){console.error(log);throw error;}finally{proc.kill();await new Promise(r=>proc.once('exit',r));rmSync(dir,{recursive:true,force:true});}
});
