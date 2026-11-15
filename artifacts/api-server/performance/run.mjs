// Runs the real production build and SQL queries. Never points HTTP at a deployed site.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import pg from 'pg';
import { summarize, assertLocalDatabase } from './metrics.mjs';
import { benchmarkDiscord } from './discord.mjs';

const database = process.env.TEST_DATABASE_URL;
assertLocalDatabase(database, process.env.PERF_DISPOSABLE_DB);
assert.ok(process.env.PERF_BOT_DIR || process.env.PERF_WEB_ONLY==='yes','Set PERF_BOT_DIR for the full suite, or explicitly PERF_WEB_ONLY=yes.');
const port = 18806;
const base = `http://127.0.0.1:${port}`;
const run = Date.now().toString(36);
const ssl = process.env.PERF_DB_SSL_CA ? {ca:readFileSync(process.env.PERF_DB_SSL_CA,'utf8'),rejectUnauthorized:true} : undefined;
const serverFile=process.env.PERF_SERVER_FILE || fileURLToPath(new URL('../dist/index.mjs',import.meta.url));
const cpu=process.env.PERF_SERVER_CPU;
const heap=process.env.PERF_SERVER_HEAP_MB;
if(cpu)assert.match(cpu,/^\d+$/);
if(heap)assert.match(heap,/^[1-9]\d*$/);
function startServer(options) {
  const args=[...(heap?[`--max-old-space-size=${heap}`]:[]),serverFile];
  return spawn(cpu?'taskset':process.execPath,cpu?['-c',cpu,process.execPath,...args]:args,options);
}
const report = {requirement:'NFR-06',date:new Date().toISOString(),node:process.version,
  platform:`${os.platform()} ${os.arch()}`,cpus:os.availableParallelism(),
  runtime_profile:{name:process.env.PERF_PROFILE||'local-baseline',cpu_affinity:cpu||'unrestricted',v8_heap_limit_mb:heap?Number(heap):null,artifact_layout:process.env.PERF_SERVER_FILE?'Dockerfile output layout, no node_modules':'source build'},
  records:1000,concurrency:100,rounds:10,main_commit:'bdc7193',external_services:'Discord I/O simulated; email disabled',measurements:{},checks:{},
  discord_verification:{status:'NOT_MEASURED',reason:'Separate Discord-Bot deployment; requires normal Discord responses. Website HTTP tests cannot prove this criterion.'}};
let child, db, locker;
const apiSamples=[];
async function recordMemory(){
  try{const status=await readFile(`/proc/${child.pid}/status`,'utf8');
    const kb=Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]);
    if(Number.isFinite(kb))report.app_peak_rss_kb=Math.max(report.app_peak_rss_kb||0,kb);
  }catch{}
}
async function request(path, {method='GET', cookie, body}={}) {
  const start = performance.now();
  try {
    const response = await fetch(base+path,{method,headers:{...(cookie?{Cookie:`sid=${cookie}`}:{ }),
      ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,
      signal:AbortSignal.timeout(15000)});
    const text=await response.text();
    return {status:response.status,text,ms:performance.now()-start};
  } catch(e) {return {status:0,text:e.name,ms:performance.now()-start};}
}
async function phase(name, path, limit, validate, options={}) {
  const results=[];
  await Promise.all(Array.from({length:100},async(_,user)=>{
    for(let round=0;round<10;round++){
      const r=await request(typeof path==='function'?path(user,round):path,
        {...options,cookie:options.public?undefined:`perf-${run}-${user}`});
      let ok=false;try{ok=r.status===200 && validate(r.text);}catch{}
      results.push({ms:r.ms,ok});
    }
  }));
  if(name!=='event_hub_html')apiSamples.push(...results);
  report.measurements[name]=summarize(results,limit);
  if (name==='participant_search' || name==='csv_export_1000') {
    report.measurements[name].gate='every response';
    report.measurements[name].passed &&= results.every(r=>r.ms<=limit);
  }
  await recordMemory();
  console.log(name,JSON.stringify(report.measurements[name]));
}
try {
  // Refuse an existing listener: never silently benchmark a different application.
  try {await fetch(base+'/api/healthz',{signal:AbortSignal.timeout(300)});
    throw new Error('Port 18806 already occupied; stop that process first.');
  } catch(e) {if(e.message.includes('occupied'))throw e;}
  child=startServer({
    env:{...process.env,PORT:String(port),NODE_ENV:'production',DATABASE_URL:database,DATABASE_SSL_CA:process.env.PERF_DB_SSL_CA||'',
      RUN_MIGRATIONS:'true',ADMIN_EMAILS:'perf-admin@example.com',RESEND_API_KEY:'',
      CANONICAL_HOST:'',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore']});
  let ready=false;
  for(let i=0;i<150;i++) {if(child.exitCode!==null)throw new Error('Server exited before readiness');
    if((await request('/api/healthz')).status===200){ready=true;break;}
    await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'Production server ready');
  db=new pg.Client({connectionString:database,ssl});await db.connect();
  report.database={version:(await db.query('select version()')).rows[0].version,
    tls:(await db.query('select ssl from pg_stat_ssl where pid=pg_backend_pid()')).rows[0].ssl,
    certificate_validation:!!ssl};
  if(ssl)assert.equal(report.database.tls,true);
  // A fresh database is required, not merely a fresh run prefix.
  assert.equal(Number((await db.query('select count(*) from registrations')).rows[0].count),0,
    'Database must contain zero registrations before seeding');
  await db.query("insert into users(id,email) values($1,'perf-admin@example.com')",[`perf-admin-${run}`]);
  for(let i=0;i<100;i++) await db.query('insert into sessions(sid,sess,expire) values($1,$2,$3)',[
    `perf-${run}-${i}`,JSON.stringify({user:{id:`perf-admin-${run}`,name:'Load-test organizer',roles:[]}}),
    new Date(Date.now()+3600000).toISOString()]);
  const seeded=await db.query(`insert into registrations(name,email,school,class_standing,
    experience_level,discord_username,team_status,status)
    select 'Load participant '||i,'perf-${run}-'||i||'@example.edu','Test University',
      'junior','beginner','perf.person.'||i,'solo',case when i%2=0 then 'approved' else 'pending' end
    from generate_series(1,1000) i returning id,email`);
  const ids=seeded.rows.map(r=>r.id);
  if(process.env.PERF_BOT_DIR)report.discord_verification=await benchmarkDiscord({admin:db,databaseUrl:database,ssl,botRoot:process.env.PERF_BOT_DIR,registrations:seeded.rows});
  // The public content read is measured with real published data, not an empty shortcut.
  await db.query('analyze registrations');
  await db.query(`insert into event_content(event_id,kind,title,body,position,published,author_id)
    values('builderwars-2026','announcement','Load test announcement','Test content',0,true,$1)`,[`perf-admin-${run}`]);
  if(process.env.PERF_BROWSER==='yes'){
    const {checkBrowser}=await import('./browser.mjs');
    report.browser=await checkBrowser({base,session:`perf-${run}-0`,email:seeded.rows[0].email,id:ids[0],resetFixtureAttendance:async()=>{await db.query('update registrations set checked_in_at=null,checked_in_by=null where id=$1',[ids[0]]);}});
  }
  await phase('event_hub_html','/',2000,t=>t.includes('<div id="root">'),{public:true});
  await phase('published_content','/api/event-content',2000,t=>t.includes('Load test announcement'),{public:true});
  await phase('participant_search',i=>`/api/admin/registrations?search=${encodeURIComponent('Load participant '+(i+1))}&limit=25`,2000,
    t=>{const x=JSON.parse(t);return x.total>0&&x.registrations.length>0&&x.registrations.length<=25;});
  await phase('dashboard_stats','/api/admin/stats',2000,t=>{const x=JSON.parse(t);return x.total===1000 && x.checked_in===0;});
  await phase('csv_export_1000','/api/admin/export',10000,t=>{
    const rows=t.trim().split(/\r?\n/);return rows.length===1001 && rows[0].includes('email') && t.includes(`perf-${run}-1000@example.edu`);});
  report.measurements.all_api_responses=summarize(apiSamples,2000);
  // Twice the target load: 200 simultaneous writers for ONE registration.
  const arrival=await Promise.all(Array.from({length:200},(_,i)=>request(`/api/admin/registrations/${ids[0]}/check-in`,
    {method:'POST',cookie:`perf-${run}-${i%100}`})));
  assert.equal(arrival.filter(r=>r.status===200).length,1);
  assert.equal(arrival.filter(r=>r.status===409).length,199);
  const saved=(await db.query('select checked_in_at,checked_in_by from registrations where id=$1',[ids[0]])).rows[0];
  assert.ok(saved.checked_in_at);assert.equal(saved.checked_in_by,`perf-admin-${run}`);
  report.checks.concurrent_duplicate_check_in={passed:true,concurrent_requests:200,successes:1,conflicts:199};
  // Force a genuine server-side PostgreSQL lock timeout, not a client abort.
  // Restart only the private test server with a short lock timeout for fault injection.
  child.kill();await once(child,'exit');child=null;
  child=startServer({
    env:{...process.env,PORT:String(port),NODE_ENV:'production',DATABASE_URL:database,DATABASE_SSL_CA:process.env.PERF_DB_SSL_CA||'',
      PGOPTIONS:'-c lock_timeout=300ms',RUN_MIGRATIONS:'false',ADMIN_EMAILS:'perf-admin@example.com',
      RESEND_API_KEY:'',CANONICAL_HOST:'',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore']});
  ready=false;for(let i=0;i<100;i++){if((await request('/api/healthz')).status===200){ready=true;break;}
    await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  locker=new pg.Client({connectionString:database,ssl});await locker.connect();
  await locker.query('begin');await locker.query('select id from registrations where id=$1 for update',[ids[1]]);
  const blocked=await request(`/api/admin/registrations/${ids[1]}/check-in`,{method:'POST',cookie:`perf-${run}-0`});
  assert.equal(blocked.status,500);assert.match(JSON.parse(blocked.text).error,/could not be confirmed/);
  assert.ok(blocked.ms<5000);await locker.query('rollback');await locker.end();locker=null;
  assert.equal((await db.query('select checked_in_at from registrations where id=$1',[ids[1]])).rows[0].checked_in_at,null);
  report.checks.database_lock_timeout={passed:true,status:blocked.status,ms:blocked.ms,attendance_unchanged:true};
  const integrity=(await db.query(`select count(*)::int total,count(distinct email)::int emails,
    count(*) filter(where checked_in_at is not null)::int arrivals from registrations`)).rows[0];
  assert.deepEqual(integrity,{total:1000,emails:1000,arrivals:1});
  report.checks.final_integrity={passed:true,...integrity};
  report.website_passed=Object.values(report.measurements).every(m=>m.passed);
  report.controlled_suite_passed=report.website_passed && report.discord_verification.passed===true;
  report.live_deployment_validated=false;
  report.full_nfr06_passed=false; // Production-equivalent hardware and real Discord remain a rollout gate.
  if(!report.website_passed || (process.env.PERF_WEB_ONLY!=='yes' && !report.controlled_suite_passed))process.exitCode=1;
} catch(e) {report.error=e.message;report.website_passed=false;report.full_nfr06_passed=false;process.exitCode=1;console.error(e);}
finally {
  if(locker){await locker.query('rollback').catch(()=>{});await locker.end();}
  if(db)await db.end();
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  await writeFile(process.env.PERF_REPORT ?? 'nfr06-results.json',JSON.stringify(report,null,2)+'\n');
}
