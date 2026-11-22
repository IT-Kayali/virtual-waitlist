'use strict';
// Bounded application smoke/load test. Never target third-party services.
const fs = require('fs');
const base = process.argv[2];
const slug = process.argv[3];
if (!base || !slug || !process.argv.includes('--confirm-own-test-tenant')) {
  console.error('node scripts/load-test.js BASE_URL TEST_SLUG --confirm-own-test-tenant');process.exit(1);
}
const origin = new URL(base).origin;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const allTickets = new Set();
async function run() {
  const settings = await fetch(origin + '/api/b/' + encodeURIComponent(slug) + '/settings');
  if (!settings.ok) throw new Error('Test tenant not available');
  const results = [];
  for (const concurrency of [10,50,100]) {
    const measurements = [], errors = [];
    async function req(path, body, label) {
      const start = performance.now();let ok=false, data;
      try {
        const r = await fetch(origin+path,{ ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(8000) });
        ok=r.ok; if (label==='join') {data=await r.json();if(data.ticket?.id) allTickets.add(data.ticket.id);else ok=false;} else await r.arrayBuffer();
        if(!ok) errors.push({label,status:r.status});
      } catch(e) {errors.push({label,error:e.name});}
      measurements.push({label,ms:performance.now()-start,ok});return data;
    }
    const start=performance.now();
    await Promise.all(Array.from({length:concurrency},async(_,i)=>{
      const prefix='/api/b/'+encodeURIComponent(slug);
      await req('/b/'+encodeURIComponent(slug)+(i%2?'/kiosk':''),null,i%2?'kiosk-page':'guest-page');
      const d=await req(prefix+'/join',{name:'Lasttest',source:i%2?'counter':'guest'},'join');
      const id=d?.ticket?.id;if(!id)return;
      try {
        for(let n=0;n<3;n++){await sleep(3000);await req(prefix+'/ticket/'+id,null,'ticket-poll');}
      }finally{await req(prefix+'/ticket/'+id+'/cancel',{},'cancel');}
    }));
    const sorted=measurements.map(x=>x.ms).sort((a,b)=>a-b);
    const pct=p=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]);
    const row={concurrency,requests:measurements.length,errors:errors.length,error_percent:+(100*errors.length/measurements.length).toFixed(2),duration_seconds:+((performance.now()-start)/1000).toFixed(2),median_ms:pct(.5),p95_ms:pct(.95),p99_ms:pct(.99),max_ms:pct(1),by_endpoint:{}};
    for(const label of new Set(measurements.map(m=>m.label))){const vals=measurements.filter(m=>m.label===label).map(m=>m.ms).sort((a,b)=>a-b);row.by_endpoint[label]={requests:vals.length,p95_ms:Math.round(vals[Math.ceil(vals.length*.95)-1])};}
    results.push(row);console.log(JSON.stringify(row));
    const health=await fetch(origin+'/api/b/'+encodeURIComponent(slug)+'/settings',{signal:AbortSignal.timeout(8000)});
    if(!health.ok||row.error_percent>5||row.p95_ms>3000){console.log('STOP: safety threshold exceeded');break;}
    await sleep(3000);
  }
  // Cancel once more sequentially only if an earlier user journey failed to finish.
  const report={tested_at:new Date().toISOString(),origin,tenant:slug,scenario:'10/50/100 concurrent journeys: guest/kiosk page, join, 3 ticket polls at 3s, cancel. No payment or login load.',ticket_count:allTickets.size,results};
  fs.mkdirSync('docs/test-results',{recursive:true});
  fs.writeFileSync('docs/test-results/load-test.json',JSON.stringify(report,null,2)+'\n');
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
