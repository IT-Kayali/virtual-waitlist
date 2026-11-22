'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function harness({qr=true,claimed=false,canSubscribe=true}={}){
 const elements=new Map(),storage=new Map(),events=[],timers=[],handlers=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',required:true,disabled:false,textContent:'',style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(name,fn){this['on'+name]=fn;}});return elements.get(id);};
 const location={pathname:qr?'/b/demo/claim':'/b/demo/',search:'',hash:qr?'#id=12&key='+'a'.repeat(64):'',assign:url=>events.push({type:'navigate',url}),replace(){}};
 const context={location,history:{replaceState(){events.push({type:'clear-fragment'});location.hash='';}},URLSearchParams,Number,Promise,JSON,
 document:{getElementById:el},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
 setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},t:key=>key,applyI18n(){},renderLangPicker(){},setLang(){},currentLang:'de',addEventListener:(name,fn)=>handlers.set(name,fn),
 QueuePush:{state:'off',canSubscribe,createToken:()=> '1'.repeat(64),prepareSubscription:()=>{events.push({type:'permission'});return Promise.resolve({toJSON:()=>({endpoint:'fixture'})});}},
 fetch:async(url,options)=>{events.push({type:'request',url,options});let data={};if(url.endsWith('/settings'))data={venue:'Fixture',has_logo:false};if(url.endsWith('/preview'))data={id:12,number:42,venue:'Fixture',claimed};if(url.endsWith('/connect'))data={ticket:{id:12}};return {ok:true,json:async()=>data};}};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('public/claim.js','utf8'),context);
 const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};await flush();
 return{context,events,el,storage,flush,async enter(){el('numberInput').value='42';el('numberInput').oninput();timers.at(-1)();await flush();},submit(){el('claimForm').onsubmit({preventDefault(){}});}};
}
test('QR shows only its number and never requests permission on page load; confirmation keeps the gesture',async()=>{
 const h=await harness();assert.equal(h.el('numberInput').required,false);assert.equal(h.el('qrNumber').textContent,42);assert.equal(h.events.some(x=>x.type==='permission'),false);
 assert.equal(h.events[0].type,'clear-fragment');h.submit();
 const permission=h.events.findIndex(x=>x.type==='permission'),claim=h.events.findIndex(x=>x.url?.endsWith('/connect'));
 assert.ok(permission>=0&&claim>permission,'permission call must happen synchronously before a network await');
 await h.flush();assert.equal(h.storage.get('ql_owner_demo_12'),'1'.repeat(64));assert.equal(h.events.at(-1).url,'/b/demo/ticket?id=12');
 assert.ok(h.events.some(x=>x.url?.endsWith('/push/subscribe')));
});
test('Only the manual collection number are checked before enabling a notification gesture',async()=>{
 const h=await harness({qr:false});assert.equal(h.el('claimBtn').disabled,true);assert.equal(h.events.some(x=>x.url?.endsWith('/preview')),false);
 await h.enter();assert.equal(h.el('claimBtn').disabled,false);assert.equal(h.events.some(x=>x.type==='permission'),false);
 h.submit();await h.flush();assert.equal(h.events.filter(x=>x.type==='permission').length,1);
});
test('Blocked/unsupported push does not prevent connecting; an already-owned receipt cannot move',async()=>{
 const noPush=await harness({canSubscribe:false});assert.equal(noPush.el('claimBtn').textContent,'claim_without');noPush.submit();await noPush.flush();assert.equal(noPush.events.some(x=>x.type==='permission'),false);assert.equal(noPush.events.at(-1).type,'navigate');
 const owned=await harness({claimed:true});assert.equal(owned.el('claimBtn').disabled,true);owned.submit();await owned.flush();assert.equal(owned.events.some(x=>x.type==='permission'||x.url?.endsWith('/connect')),false);
});
