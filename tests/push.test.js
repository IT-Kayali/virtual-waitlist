'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync,statSync} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const createPush = require('../push');
const {hash,validateSubscription} = createPush;
function subscription(endpoint='https://fcm.googleapis.com/fcm/send/fixture') {
  const key=crypto.createECDH('prime256v1'); key.generateKeys();
  return {endpoint,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
}
function fixture(deliver) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'queueup-push-'));
  const databaseFile=path.join(dir,'test.sqlite');
  let db=new DatabaseSync(databaseFile);
  db.exec(`CREATE TABLE businesses(id INTEGER PRIMARY KEY,slug TEXT,active INTEGER);
    INSERT INTO businesses VALUES(1,'one',1),(2,'two',1);
    CREATE TABLE entries(id INTEGER PRIMARY KEY,business_id INTEGER,number INTEGER,status TEXT,created_at TEXT);
    INSERT INTO entries VALUES(1,1,12,'waiting',datetime('now')),(2,2,7,'waiting',datetime('now'));`);
  let time=Date.now(); const calls=[];
  const options={db,configDir:dir,subject:'https://queueup.test.invalid',now:()=>time,deliver:async(...args)=>{calls.push(args);if(deliver)return deliver(...args);return {statusCode:201};}};
  let store=createPush(options);
  const entry=(id=1)=>db.prepare('SELECT * FROM entries WHERE id=?').get(id);
  function status(value,id=1) {const before=entry(id);db.prepare('UPDATE entries SET status=?,ready_version=ready_version+? WHERE id=?').run(value,value==='ready'&&before.status!=='ready'?1:0,id);store.onStatus(entry(id));}
  return {get db(){return db;},dir,calls,entry,status,get store(){return store;},advance:ms=>{time+=ms;},reopen:async()=>{await store.stop();db.close();db=new DatabaseSync(databaseFile);options.db=db;store=createPush(options);},close:async()=>{await store.stop();db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('Push endpoints and encryption keys are checked before any network work',()=>{
  for(const url of ['https://fcm.googleapis.com/fcm/send/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/wpush/v2/x','https://wns2-am3p.notify.windows.com/w/x']) assert.equal(validateSubscription(subscription(url)).endpoint,url);
  for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.invalid/x','https://web.push.apple.com.evil.invalid/x','https://a@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#fragment'])assert.throws(()=>validateSubscription(subscription(url)));
  const bad=subscription();bad.keys.p256dh='A'.repeat(87);assert.throws(()=>validateSubscription(bad));
  assert.throws(()=>validateSubscription({endpoint:'https://fcm.googleapis.com/x',keys:{}}));
});

test('Guest capability is required, tenant-specific and never stored in plaintext',async()=>{
  const f=fixture();try{
    const token='1'.repeat(64);f.db.prepare('UPDATE entries SET guest_token_hash=? WHERE id=1').run(hash(token));
    assert.equal(f.store.authorized(f.entry(),token),true);
    assert.equal(f.store.authorized(f.entry(),'2'.repeat(64)),false);
    assert.equal(f.store.authorized(f.entry(2),token),false);
    const sub=subscription();f.store.subscribe(f.entry(),sub,'de');
    const row=f.db.prepare('SELECT * FROM push_subscriptions').get();
    assert.equal(JSON.stringify(row).includes(sub.endpoint),false);
    assert.equal(JSON.stringify(row).includes(sub.keys.auth),false);
    assert.equal(f.db.prepare('SELECT guest_token_hash FROM entries WHERE id=1').get().guest_token_hash.includes(token),false);
    assert.equal(statSync(path.join(f.dir,'.push-identity.json')).mode&0o777,0o600);
    assert.equal(f.store.subscribed(f.entry(2),sub.endpoint),false);
    for(let i=0;i<2;i++)f.store.subscribe(f.entry(),subscription('https://fcm.googleapis.com/x/'+i),'en');
    assert.throws(()=>f.store.subscribe(f.entry(),subscription('https://fcm.googleapis.com/x/extra'),'en'));
  }finally{await f.close();}
});

test('Ready jobs survive restart, send once per call, reuse VAPID and omit guest details',async()=>{
  const f=fixture();try{
    const sub=subscription();f.store.subscribe(f.entry(),sub,'ar');f.status('ready');f.store.onStatus(f.entry());
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n,1);
    const backup=new DatabaseSync(path.join(f.dir,'.pre-push-migration.sqlite'),{readOnly:true});
    assert.equal(backup.prepare('SELECT count(*) AS n FROM entries').get().n,2);backup.close();
    const publicKey=f.store.publicKey;await f.reopen();assert.equal(f.store.publicKey,publicKey);
    await f.store.tick();await f.store.tick();assert.equal(f.calls.length,1);
    const payload=JSON.parse(f.calls[0][1]);assert.equal(payload.id,1);assert.equal(payload.lang,'ar');assert.equal(payload.number,12);
    assert.equal(Object.hasOwn(payload,'name'),false);assert.equal(Object.hasOwn(payload,'note'),false);
    assert.equal(Object.hasOwn(payload,'guest_token'),false);
    assert.ok(f.calls[0][2].TTL<=60);assert.equal(f.calls[0][2].urgency,'high');
    const details=require('web-push').generateRequestDetails(...f.calls[0]);
    assert.ok(Buffer.isBuffer(details.body));assert.equal(details.body.includes(Buffer.from('ready')),false);
    const auth=f.calls[0][2].headers.Authorization;assert.match(auth,/^vapid /);
    f.status('waiting');f.advance(10000);f.status('ready');await f.store.tick();assert.equal(f.calls.length,2);
    assert.equal(f.calls[1][2].headers.Authorization,auth,'VAPID must not refresh for each message');
    f.advance(6*60000);await f.store.tick();f.store.onStatus(f.entry());await f.store.tick();assert.equal(f.calls.length,2,'sent-version marker outlives short job records');
    f.status('done');assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n,0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n,0);
  }finally{await f.close();}
});

test('Temporary failures retry, terminal/disabled tickets and expired jobs do not send',async()=>{
  let fail=true;const f=fixture(async()=>{if(fail)throw Object.assign(new Error('fixture'),{statusCode:503});});
  try{
    f.store.subscribe(f.entry(),subscription(),'de');f.status('ready');await f.store.tick();assert.equal(f.calls.length,1);
    await f.store.tick();assert.equal(f.calls.length,1);f.advance(5100);fail=false;await f.store.tick();assert.equal(f.calls.length,2);
    f.status('waiting');f.status('ready');f.status('cancelled');await f.store.tick();assert.equal(f.calls.length,2);
    f.store.subscribe(f.entry(2),subscription('https://fcm.googleapis.com/x/two'),'en');f.status('ready',2);
    f.db.prepare('UPDATE businesses SET active=0 WHERE id=2').run();await f.store.tick();assert.equal(f.calls.length,2);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n,0);
  }finally{await f.close();}
});

test('Unsubscribe and gone endpoints erase the encrypted address and queued work',async()=>{
  const f=fixture(async()=>{throw Object.assign(new Error('fixture'),{statusCode:410});});
  try{
    const sub=subscription();f.store.subscribe(f.entry(),sub,'en');f.status('ready');f.store.unsubscribe(f.entry(),sub.endpoint);
    await f.store.tick();assert.equal(f.calls.length,0);
    f.store.subscribe(f.entry(),sub,'en');await f.store.tick();assert.equal(f.calls.length,1);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n,0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n,0);
  }finally{await f.close();}
});
