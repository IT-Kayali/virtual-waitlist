'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),counterStore=require('../counter');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE entries(id INTEGER PRIMARY KEY,business_id INTEGER,day TEXT,number INTEGER,name TEXT DEFAULT '',note TEXT DEFAULT '',source TEXT DEFAULT 'counter',counter_nonce TEXT,status TEXT DEFAULT 'waiting',created_at TEXT,guest_token_hash TEXT)");
 const push={capability:(...parts)=>crypto.createHash('sha256').update(parts.join(':')).digest('hex')};
 const store=counterStore({db,push,baseURL:'https://queueup.test.invalid',now:()=>Date.parse('2026-11-22T20:00:00Z')});
 const add=(number,day='2026-11-22',business=1,status='waiting')=>db.prepare('INSERT INTO entries(business_id,day,number,counter_nonce,status,created_at) VALUES(?,?,?,?,?,?)').run(business,day,number,crypto.randomBytes(16).toString('hex'),status,day+' 19:00:00').lastInsertRowid;
 return {db,store,add,biz:{id:1,slug:'demo',name:'Fixture'}};
}
test('Number-only lookup selects today, not a reused number from yesterday or another venue',()=>{
 const f=fixture();try{
  f.add(42,'2026-11-21');const today=f.add(42);f.add(42,'2026-11-22',2);
  assert.equal(f.store.find(f.biz,{number:42}).id,Number(today));
  assert.equal(f.store.find(f.biz,{number:42,code:'ignored obsolete field'}).id,Number(today));
  f.add(43,'2026-11-21');assert.throws(()=>f.store.find(f.biz,{number:43}));
  f.add(44,'2026-11-22',1,'cancelled');assert.throws(()=>f.store.find(f.biz,{number:44}));
  for(const number of [0,-1,1.5,1000000000,'42',null])assert.throws(()=>f.store.find(f.biz,{number}));
 }finally{f.db.close();}
});
test('Receipt has QR and number without a code; an existing yesterday QR still identifies its exact ticket',async()=>{
 const f=fixture();try{
  const id=f.add(42,'2026-11-21');f.add(42);
  const entry=f.db.prepare('SELECT * FROM entries WHERE id=?').get(id),receipt=await f.store.receipt(entry,f.biz);
  assert.equal(Object.hasOwn(receipt,'code'),false);assert.equal(receipt.number,42);
  const fragment=new URLSearchParams(new URL(receipt.claim_url).hash.slice(1));
  const key=f.store.find(f.biz,{id:Number(id),key:fragment.get('key')});
  assert.equal(key.id,Number(id));
  assert.equal(fragment.get('key'),crypto.createHash('sha256').update(['counter:qr',1,Number(id),entry.counter_nonce].join(':')).digest('hex'));
 }finally{f.db.close();}
});
