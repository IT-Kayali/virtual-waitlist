'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const store = require('../billing-settings');
test('Admin secrets encrypted, masked, durable; blank preserves and clear deletes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queueup-secrets-'));const db=new DatabaseSync(':memory:');
 try{
  const a=store({db,env:{},configDir:dir});
  const result=a.save({fields:{STRIPE_SECRET_KEY:'sk_test_fixture_only_9876',PAYPAL_CLIENT_SECRET:'paypal_fixture_5432'},mode:'test',public_base_url:'https://example.invalid'});
  const ciphertext=db.prepare('SELECT encrypted FROM billing_config').get().encrypted;
  assert.equal(ciphertext.includes('sk_test'),false);assert.equal(ciphertext.includes('paypal_fixture'),false);
  assert.equal(JSON.stringify(result).includes('sk_test'),false);assert.equal(result.fields.STRIPE_SECRET_KEY.suffix,'9876');
  assert.equal(fs.statSync(path.join(dir,'.billing-key')).mode & 0o777,0o600);
  const b=store({db,env:{},configDir:dir});assert.equal(b.all().STRIPE_SECRET_KEY,'sk_test_fixture_only_9876');
  b.save({fields:{STRIPE_SECRET_KEY:''}});assert.equal(b.all().STRIPE_SECRET_KEY,'sk_test_fixture_only_9876');
  b.save({clear_fields:['STRIPE_SECRET_KEY']});assert.equal(b.masked().fields.STRIPE_SECRET_KEY.configured,false);
  assert.throws(()=>b.save({public_base_url:'http://example.invalid'}));
  assert.throws(()=>b.save({mode:'unknown'}));
  assert.throws(()=>store({db,env:{BILLING_CONFIG_KEY:crypto.randomBytes(32).toString('hex')},configDir:dir}));
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
