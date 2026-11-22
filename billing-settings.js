'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const SECRET_FIELDS = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID'];
const FIELDS = [...SECRET_FIELDS,'BILLING_MODE','PUBLIC_BASE_URL'];
module.exports = function settingsStore({db,env,configDir}) {
  db.exec('CREATE TABLE IF NOT EXISTS billing_config (id INTEGER PRIMARY KEY CHECK(id=1), encrypted TEXT NOT NULL)');
  let key;
  if (env.BILLING_CONFIG_KEY) {
    if (!/^[a-fA-F0-9]{64}$/.test(env.BILLING_CONFIG_KEY)) throw new Error('BILLING_CONFIG_KEY muss 64 Hex-Zeichen enthalten');
    key=Buffer.from(env.BILLING_CONFIG_KEY,'hex');
  } else if (configDir) {
    const file=path.join(configDir,'.billing-key');
    try {fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});} catch(e){if(e.code!=='EEXIST')throw e;}
    fs.chmodSync(file,0o600);key=fs.readFileSync(file);
    if(key.length!==32)throw new Error('Billing-Schlüsseldatei beschädigt');
  } else key=crypto.randomBytes(32); // Isolated in-memory unit tests only.
  function decrypt() {
    const row=db.prepare('SELECT encrypted FROM billing_config WHERE id=1').get();if(!row)return {};
    const [iv,tag,data]=row.encrypted.split('.').map(x=>Buffer.from(x,'base64'));
    const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('queueup-billing-v1'));cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));
  }
  let stored=decrypt();
  function all(){const c={...env};for(const k of FIELDS)if(Object.hasOwn(stored,k))c[k]=stored[k];return c;}
  function masked(){const c=all(),out={};for(const k of SECRET_FIELDS){const v=c[k]||'';out[k]={configured:!!v,suffix:v?v.slice(-4):''};}return {fields:out,mode:c.BILLING_MODE||'disabled',public_base_url:c.PUBLIC_BASE_URL||'',live_locked:true};}
  function save(body){
    const next={...stored},updates=body.fields || {};
    for(const k of SECRET_FIELDS){
      if((body.clear_fields||[]).includes(k))next[k]='';
      else if(typeof updates[k]==='string'&&updates[k].trim()){
        if(updates[k].length>2048)throw new Error('Feld zu lang');next[k]=updates[k].trim();
      }
    }
    if(body.mode!==undefined){if(!['disabled','test','live'].includes(body.mode))throw new Error('Ungültiger Modus');next.BILLING_MODE=body.mode;}
    if(body.public_base_url!==undefined){const u=new URL(String(body.public_base_url));if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('HTTPS-Basisadresse ohne Pfad verwenden');next.PUBLIC_BASE_URL=u.origin;}
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('queueup-billing-v1'));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(next),'utf8'),cipher.final()]);
    const value=[iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64')).join('.');
    db.prepare('INSERT INTO billing_config(id,encrypted) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted').run(value);
    stored=next;return masked();
  }
  return {all,masked,save};
};
