'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const register = require('../billing');
function fixture(provider = 'stripe', extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE businesses(id INTEGER, name TEXT, slug TEXT); INSERT INTO businesses VALUES(1,'Test','test');
    CREATE TABLE plans(id INTEGER,slug TEXT,active INTEGER,name TEXT,price_cents INTEGER,currency TEXT,stripe_price_id TEXT,paypal_plan_id TEXT);
    INSERT INTO plans VALUES(1,'pro',1,'Pro',1900,'EUR','price_test','P-test');`);
  const routes = [], calls = [], state = { status: 'active', paypal: 'ACTIVE', id: null };
  const env = { BILLING_MODE:'test',PUBLIC_BASE_URL:'https://test.example',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',
    PAYPAL_CLIENT_ID:'fixture',PAYPAL_CLIENT_SECRET:'fixture',PAYPAL_WEBHOOK_ID:'fixture',...extra };
  async function fetcher(url, opts) {
    calls.push([url, opts]);
    let data = {};
    if (url.includes('/prices/')) data = { active:true,unit_amount:1900,currency:'eur',recurring:{ interval:'month',interval_count:1 },type:'recurring',livemode:false };
    else if (url.endsWith('/checkout/sessions')) {
      state.id = new URLSearchParams(opts.body).get('client_reference_id');
      data = { id:'cs_fixture', url:'https://checkout.stripe.com/c/pay/fixture' };
    } else if (url.includes('/checkout/sessions/')) {
      if (url.endsWith('/expire')) { state.status = 'expired'; data = {}; }
      else data = { client_reference_id:state.id,subscription:state.status === 'expired' ? null : 'sub_fixture',status:state.status === 'expired' ? 'expired' : 'complete' };
    } else if (url.includes('/subscriptions/sub_fixture')) {
      if (opts.method === 'DELETE') state.status = 'canceled';
      data = { metadata:{billing_id:state.id},items:{data:[{ price:{id:'price_test'},quantity:1 }]},status:state.status,livemode:false,current_period_end:1800000000 };
    } else if (url.endsWith('/oauth2/token')) data = { access_token:'test_access',expires_in:300 };
    else if (url.includes('/billing/plans/')) data = { status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{value:'19.00',currency_code:'EUR'}}}] };
    else if (url.endsWith('/billing/subscriptions')) {
      state.id = JSON.parse(opts.body).custom_id;
      data = {id:'I-fixture',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=fixture'}]};
    } else if (url.endsWith('/cancel')) {state.paypal = 'CANCELLED';}
    else if (url.includes('/billing/subscriptions/')) data = {custom_id:state.id,plan_id:'P-test',status:state.paypal};
    else if (url.includes('/verify-webhook-signature')) data = {verification_status:'SUCCESS'};
    else throw new Error('Unexpected test request ' + url);
    return {ok:true,status:200,text:async()=>JSON.stringify(data)};
  }
  register({db,env,fetcher,route:(method,path,handler,opts)=>routes.push({method,path,handler,opts}),send:(res,status,body)=>Object.assign(res,{status,body}),readBody:async req=>req.body});
  async function call(path, body={}, reqExtra={}) {
    const r = routes.find(r=>r.path === path), res = {};
    await r.handler(Object.assign(reqExtra,{body,headers:reqExtra.headers || {}}),res,null,{},null,{business_id:1,business:{email:'test@example.invalid'}});
    return res;
  }
  return {db,routes,calls,state,call,env};
}
test('Stripe raw HMAC verifies signed bytes, rejects forged/old payloads',()=>{
  const now=Date.now(),t=Math.floor(now/1000),raw=Buffer.from('{"a": 1}');
  const sig=crypto.createHmac('sha256','x').update(t+'.').update(raw).digest('hex');
  assert.equal(register.verifyStripe(raw,`t=${t},v1=${sig}`,'x',now),true);
  assert.equal(register.verifyStripe(Buffer.from('{"a":1}'),`t=${t},v1=${sig}`,'x',now),false);
  assert.equal(register.verifyStripe(raw,`t=${t},v1=${sig}`,'x',now+600000),false);
});
test('Default disabled, and live blocked even if approval flag set',async()=>{
  for(const env of [{BILLING_MODE:'disabled'},{BILLING_MODE:'live',BILLING_LIVE_APPROVED:'true',STRIPE_SECRET_KEY:'sk_live_fixture'}]){
    const f=fixture('stripe',env); const r=await f.call('/api/billing/checkout',{provider:'stripe',plan:'pro'});
    assert.equal(r.status,503);assert.equal(f.calls.length,0);
  }
});
test('Owner-only billing routes; admin-only billing overview',()=>{
  const f=fixture();
  for(const r of f.routes.filter(r=>r.path.startsWith('/api/billing/'))) assert.deepEqual(r.opts,{staff:true,owner:true});
  assert.deepEqual(f.routes.find(r=>r.path==='/api/admin/billing').opts,{admin:true});
});
for(const provider of ['stripe','paypal']) test(provider+' checkout, duplicate guard, source sync, verified cancellation',async()=>{
  const f=fixture(provider);
  let r=await f.call('/api/billing/checkout',{provider,plan:'pro'});assert.equal(r.status,200);
  const row=f.db.prepare('SELECT * FROM billing_orders').get();assert.equal(row.status,'pending');
  r=await f.call('/api/billing/status');assert.equal(r.body.subscription.status,'pending');
  r=await f.call('/api/billing/refresh');assert.equal(r.status,200);assert.equal(r.body.subscription.status,'active');
  r=await f.call('/api/billing/cancel',{id:row.id,confirm:true});assert.equal(r.status,200);assert.equal(r.body.subscription.status,'cancelled');
  // All calls stay on fixed providers, never caller URLs.
  assert.ok(f.calls.every(([url])=>url.startsWith('https://api.stripe.com/')||url.startsWith('https://api-m.sandbox.paypal.com/')));
});
test('Concurrent checkout only creates one remote subscription',async()=>{
  const f=fixture();const r=await Promise.all([f.call('/api/billing/checkout',{provider:'stripe',plan:'pro'}),f.call('/api/billing/checkout',{provider:'paypal',plan:'pro'})]);
  assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(f.db.prepare('SELECT count(*) AS c FROM billing_orders').get().c,1);
});
test('Stripe signed webhook syncs current source, replays deduplicated',async()=>{
  const f=fixture();await f.call('/api/billing/checkout',{provider:'stripe',plan:'pro'});
  const raw=Buffer.from(JSON.stringify({id:'evt_test',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_fixture'}}}));
  const t=Math.floor(Date.now()/1000),sig=crypto.createHmac('sha256',f.env.STRIPE_WEBHOOK_SECRET).update(t+'.').update(raw).digest('hex');
  const req=()=>Object.assign((async function*(){yield raw;})(),{headers:{'stripe-signature':`t=${t},v1=${sig}`}});
  let r=await f.call('/api/webhooks/stripe',{},req());assert.equal(r.status,200);
  assert.equal(f.db.prepare('SELECT status FROM billing_orders').get().status,'active');
  const count=f.calls.length;r=await f.call('/api/webhooks/stripe',{},req());assert.equal(r.status,200);assert.equal(f.calls.length,count);
  r=await f.call('/api/webhooks/stripe',{},Object.assign((async function*(){yield raw;})(),{headers:{'stripe-signature':'v1=00'}}));assert.equal(r.status,400);
});
test('PayPal postback preserves raw event and syncs current subscription',async()=>{
  const f=fixture('paypal');await f.call('/api/billing/checkout',{provider:'paypal',plan:'pro'});
  const raw=Buffer.from('{ "id": "evt_pp", "event_type": "BILLING.SUBSCRIPTION.ACTIVATED", "resource": {"id":"I-fixture"} }');
  const req=Object.assign((async function*(){yield raw;})(),{headers:{'paypal-transmission-id':'t','paypal-transmission-sig':'s','paypal-cert-url':'https://api.paypal.com/cert','paypal-transmission-time':'t','paypal-auth-algo':'SHA256withRSA'}});
  const r=await f.call('/api/webhooks/paypal',{},req);assert.equal(r.status,200);
  const body=f.calls.find(([url])=>url.includes('/verify-webhook-signature'))[1].body;
  assert.ok(body.includes(raw.toString()));assert.equal(f.db.prepare('SELECT status FROM billing_orders').get().status,'active');
});
