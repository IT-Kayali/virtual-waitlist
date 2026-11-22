'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('Full HTTP auth, page routing, inquiries and disabled billing',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'queueup-http-'));
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'4137',DATA_DIR:dir,ADMIN_EMAIL:'admin@test.invalid',ADMIN_PASSWORD:'fixture-password',BILLING_MODE:'disabled'}});
 let log='';proc.stdout.on('data',x=>log+=x);proc.stderr.on('data',x=>log+=x);
 const base='http://localhost:4137';
 async function request(p,{body,cookie,origin}={}){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  for(let n=0;n<80;n++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,50));}}
  for(const p of ['/','/anmelden','/preise','/kontakt','/impressum','/datenschutz','/abo','/admin','/b/demo/kiosk'])assert.equal((await fetch(base+p)).status,200,p);
  assert.equal((await request('/api/billing/status')).status,401);
  assert.equal((await request('/api/billing/checkout',{body:{provider:'stripe',plan:'pro'}})).status,401);
  const signup=await request('/api/signup',{body:{venue_name:'HTTP Test',email:'http@test.invalid',password:'fixture-password',pin:'123456'}});assert.equal(signup.status,200,JSON.stringify(signup));
  const owner=signup.cookie;
  let r=await request('/api/billing/status',{cookie:owner});assert.equal(r.status,200);assert.equal(r.data.mode,'disabled');assert.equal(r.data.subscription,null);
  assert.equal((await request('/api/billing/checkout',{cookie:owner,body:{provider:'paypal',plan:'pro'}})).status,503);
  assert.equal((await request('/api/billing/checkout',{cookie:owner,origin:'https://evil.invalid',body:{provider:'stripe',plan:'pro'}})).status,403);
  const staff=await request('/api/b/'+signup.data.slug+'/staff/login',{body:{pin:'123456'}});
  assert.equal((await request('/api/billing/status',{cookie:staff.cookie})).status,403);
  assert.equal((await request('/api/admin/billing',{cookie:owner})).status,401);
  const admin=await request('/api/admin/login',{body:{email:'admin@test.invalid',password:'fixture-password'}});
  assert.equal((await request('/api/admin/billing',{cookie:admin.cookie})).status,200);
  assert.equal((await request('/api/public/inquiry',{body:{name:'Tester',email:'test@example.invalid',message:'Testanfrage'}})).status,201);
  r=await request('/api/admin/inquiries',{cookie:admin.cookie});assert.equal(r.data.inquiries.length,1);
  assert.equal((await request('/api/webhooks/stripe',{body:{type:'checkout.session.completed'}})).status,503);
  assert.equal((await request('/api/webhooks/paypal',{body:{event_type:'BILLING.SUBSCRIPTION.ACTIVATED'}})).status,503);
 }catch(e){console.error(log);throw e;}finally{proc.kill();await new Promise(r=>proc.once('exit',r));rmSync(dir,{recursive:true,force:true});}
});
