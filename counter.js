'use strict';
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const fs = require('node:fs'), path = require('node:path');
const equal = (a,b) => typeof a==='string' && typeof b==='string' && a.length===b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
module.exports = function counterStore({db,push,baseURL,configDir,now=Date.now}) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('entries') WHERE name='counter_nonce'").get()) {
    const backup=configDir&&path.join(configDir,'.pre-counter-migration.sqlite');
    if(backup&&db.prepare('SELECT COUNT(*) AS n FROM entries').get().n&&!fs.existsSync(backup)){db.prepare('VACUUM INTO ?').run(backup);fs.chmodSync(backup,0o600);}
    db.exec('ALTER TABLE entries ADD COLUMN counter_nonce TEXT');
  }
  const active = entry => entry && entry.counter_nonce && ['waiting','ready'].includes(entry.status) && Date.parse(entry.created_at.replace(' ','T')+'Z')+48*3600000>now();
  const capability = entry => push.capability('counter:qr',entry.business_id,entry.id,entry.counter_nonce);
  function issue(biz,number,day) {
    if (!Number.isSafeInteger(number)||number<1||number>999999999) throw Error('Bitte die Kassennummer mit 1 bis 9 Ziffern eingeben.');
    if (db.prepare('SELECT id FROM entries WHERE business_id=? AND day=? AND number=?').get(biz.id,day,number)) throw Error('Diese Nummer ist heute bereits vergeben. Den vorhandenen Eintrag verwenden.');
    const info=db.prepare("INSERT INTO entries(business_id,day,number,name,note,source,counter_nonce) VALUES(?,?,?,'','','counter',?)").run(biz.id,day,number,crypto.randomBytes(16).toString('hex'));
    return db.prepare('SELECT * FROM entries WHERE id=?').get(info.lastInsertRowid);
  }
  function find(biz,body) {
    let entry;
    if(Number.isSafeInteger(body.id)&&body.id>0&&typeof body.key==='string'&&/^[a-f0-9]{64}$/.test(body.key)) {
      const candidate=db.prepare('SELECT * FROM entries WHERE business_id=? AND id=?').get(biz.id,body.id);
      if(active(candidate)&&equal(body.key,capability(candidate))) entry=candidate;
    } else if(Number.isSafeInteger(body.number)&&body.number>0&&body.number<=999999999) {
      // Number-only access is an explicit product choice, not a secret proof.
      // Exact current UTC day avoids binding yesterday's reused cashier number.
      const day=new Date(now()).toISOString().slice(0,10);
      const candidate=db.prepare('SELECT * FROM entries WHERE business_id=? AND day=? AND number=? AND counter_nonce IS NOT NULL').get(biz.id,day,body.number);
      if(active(candidate)) entry=candidate;
    }
    if(!entry) throw Error('Keine aktive Abholnummer gefunden. Nummer und Geschäft prüfen. Die manuelle Eingabe gilt für den heutigen UTC-Tag.');
    return entry;
  }
  function claim(entry,token) {
    if(!/^[a-f0-9]{64}$/.test(token||'')) throw Error('Browser-Besitznachweis fehlt. Bitte neu laden.');
    if(entry.guest_token_hash) {
      if(push.authorized(entry,token)) return entry;
      throw Error('Diese Nummer ist bereits mit einem anderen Browser verbunden. Bitte den ersten Browser verwenden.');
    }
    const result=db.prepare("UPDATE entries SET guest_token_hash=? WHERE id=? AND business_id=? AND guest_token_hash IS NULL AND status IN ('waiting','ready')").run(require('./push').hash(token),entry.id,entry.business_id);
    if(result.changes!==1) throw Error('Diese Nummer wurde bereits verbunden oder ist nicht mehr aktiv.');
    return db.prepare('SELECT * FROM entries WHERE id=?').get(entry.id);
  }
  async function receipt(entry,biz) {
    if(!entry?.counter_nonce||entry.business_id!==biz.id) throw Error('Fuer diesen alten Eintrag gibt es keinen Abholbeleg.');
    const claimURL=new URL(`/b/${biz.slug}/claim`,baseURL);
    claimURL.hash=new URLSearchParams({id:String(entry.id),key:capability(entry)}).toString();
    return {id:entry.id,number:entry.number,venue:biz.name,claim_url:claimURL.href,
      manual_url:new URL(`/b/${biz.slug}/`,baseURL).href,
      qr_svg:await QRCode.toString(claimURL.href,{type:'svg',errorCorrectionLevel:'M',margin:4,width:280}),claimed:!!entry.guest_token_hash};
  }
  return {issue,find,claim,receipt};
};
