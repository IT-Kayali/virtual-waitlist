'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{mkdtempSync,rmSync}=require('node:fs'),os=require('node:os'),path=require('node:path');
const createPush=require('../push');
function fixture(){
 const dir=mkdtempSync(path.join(os.tmpdir(),'queueup-reminders-')),db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE businesses(id INTEGER PRIMARY KEY,slug TEXT,active INTEGER);INSERT INTO businesses VALUES(1,'demo',1);CREATE TABLE entries(id INTEGER PRIMARY KEY,business_id INTEGER,number INTEGER,status TEXT,created_at TEXT);INSERT INTO entries VALUES(1,1,42,'waiting',datetime('now')),(2,1,43,'waiting',datetime('now'));");
 let time=Date.now();const calls=[],store=createPush({db,configDir:dir,subject:'https://fixture.invalid',now:()=>time,deliver:async(_s,payload)=>{calls.push(JSON.parse(payload));return {statusCode:201};}});
 const key=crypto.createECDH('prime256v1');key.generateKeys();
 const sub={endpoint:'https://fcm.googleapis.com/x/fixture',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 const entry=id=>db.prepare('SELECT * FROM entries WHERE id=?').get(id||1);
 function ready(){db.prepare("UPDATE entries SET status='ready',ready_version=ready_version+1 WHERE id=1").run();store.onStatus(entry());}
 return{db,store,calls,sub,entry,ready,advance:ms=>{time+=ms;},close:async()=>{await store.stop();db.close();rmSync(dir,{recursive:true,force:true});}};
}
test('One ready call has at most three successful deliveries, spaced 30 seconds apart',async()=>{
 const f=fixture();try{
  f.store.subscribe(f.entry(),f.sub,'de');f.ready();await f.store.tick();assert.equal(f.calls.length,1);
  f.advance(29999);await f.store.tick();assert.equal(f.calls.length,1);
  f.advance(1);await f.store.tick();assert.equal(f.calls.length,2);
  f.advance(30000);await f.store.tick();assert.equal(f.calls.length,3);
  f.advance(30000);f.store.onStatus(f.entry());await f.store.tick();assert.equal(f.calls.length,3);
  assert.deepEqual(f.calls.map(x=>x.reminder),[0,1,2]);assert.equal(f.db.prepare('SELECT status FROM push_outbox').get().status,'sent');
  assert.equal(f.store.validAck(f.entry(),1,f.calls[0].ack),true);assert.equal(f.store.validAck(f.entry(2),1,f.calls[0].ack),false);
 }finally{await f.close();}
});
test('Acknowledgement stops queued reminders and cannot acknowledge a later call',async()=>{
 const f=fixture();try{
  f.store.subscribe(f.entry(),f.sub,'de');f.ready();await f.store.tick();const old=f.calls[0];
  f.store.acknowledge(f.entry(),old.version);f.store.onStatus(f.entry());f.advance(31000);await f.store.tick();assert.equal(f.calls.length,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM push_outbox').get().n,0);
  f.ready();assert.equal(f.store.validAck(f.entry(),old.version,old.ack),false);
  f.store.acknowledge(f.entry(),old.version);await f.store.tick();assert.equal(f.calls.length,2);
  assert.equal(f.calls[1].version,2);assert.equal(f.calls[1].reminder,0);
 }finally{await f.close();}
});
test('A seen call never starts reminders for a late push opt-in; pickup removes pending work',async()=>{
 const f=fixture();try{
  f.ready();f.store.acknowledge(f.entry(),1);f.store.subscribe(f.entry(),f.sub,'de');await f.store.tick();assert.equal(f.calls.length,0);
  f.ready();await f.store.tick();assert.equal(f.calls.length,1);
  f.db.prepare("UPDATE entries SET status='done' WHERE id=1").run();f.store.onStatus(f.entry());f.advance(31000);await f.store.tick();assert.equal(f.calls.length,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
 }finally{await f.close();}
});
