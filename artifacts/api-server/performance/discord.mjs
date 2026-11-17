import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { summarize } from './metrics.mjs';

// Real bot handler + service + restricted-role PostgreSQL. Only Discord I/O is simulated.
export async function benchmarkDiscord({ admin, databaseUrl, ssl, botRoot, registrations }) {
  assert.ok(botRoot, 'Set PERF_BOT_DIR to the prepared Discord-Bot checkout.');
  const root=path.resolve(botRoot);
  const require=createRequire(path.join(root,'package.json'));
  const { Pool }=require('pg');
  const { drizzle }=require('drizzle-orm/node-postgres');
  const load=p=>import(pathToFileURL(path.join(root,'dist',p)).href);
  const {runMigrations}=await load('database/migrate.js');
  const {createRepositories}=await load('database/repositories/index.js');
  const {createVerificationService}=await load('services/verificationService.js');
  const {verifyHandler}=await load('components/modals/verifyModal.js');
  const sourceSha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  await admin.query(await readFile(path.join(root,'docker/initdb/02-discord-bot-role.sql'),'utf8'));
  const url=new URL(databaseUrl);url.username='discord_bot_app';url.password='discord_bot_app_local';
  const pool=new Pool({connectionString:url.href,ssl,max:10,connectionTimeoutMillis:10000});
  const errors=[];
  let grants=0;
  const members=new Map();
  const delay=()=>new Promise(resolve=>setTimeout(resolve,25));
  const role='800000000000000001';
  try {
    await runMigrations(drizzle(pool));
    const service=createVerificationService(createRepositories(drizzle(pool),'builderwars-2026'));
    const ctx={config:{roles:{participantRoleId:role},channels:{verificationLogId:'800000000000000002'},
      registrationUrl:'https://example.invalid/register'},services:{verification:service},
      logger:{info(){},warn(){},error(){errors.push('bot error');}}};
    function interaction(index){
      const user={id:String(700000000000000000n+BigInt(index)),username:`perf.person.${index+1}`};
      let member=members.get(user.id);
      if(!member){const cache=new Set();member={id:user.id,roles:{cache,
        async add(id){await delay();assert.equal(id,role);assert.ok(!cache.has(id),'No duplicate role grant');cache.add(id);grants++;}}};members.set(user.id,member);}
      return {user,replied:false,deferred:false,replyText:'',inCachedGuild:()=>true,
        isButton:()=>false,isModalSubmit:()=>true,customId:'verify:submit',
        fields:{getTextInputValue:()=>registrations[index].email},
        async deferReply(){await delay();this.deferred=true;},
        async editReply(value){await delay();this.replyText=JSON.stringify(value);this.replied=true;},
        guild:{members:{async fetch(id){await delay();assert.equal(id,user.id);return member;}}},
        client:{channels:{async fetch(){await delay();return {isSendable:()=>true,async send(){await delay();}};}}}};
    }
    const results=[];
    await Promise.all(Array.from({length:100},async(_,worker)=>{
      for(let round=0;round<10;round++){
        const i=worker*10+round;const input=interaction(i);const start=performance.now();
        await verifyHandler.handle(input,{namespace:'verify',action:'submit',args:[]},ctx);
        results.push({ms:performance.now()-start,ok:input.replyText.includes("You're verified") &&
          members.get(input.user.id).roles.cache.has(role)});
      }
    }));
    const timing=summarize(results,5000);
    timing.gate='every completed verification';
    timing.passed &&= results.every(s=>s.ms<=5000);
    assert.ok(timing.passed,'Discord handler verification must succeed within five seconds');
    assert.equal(grants,1000);assert.deepEqual(errors,[]);
    // 200 duplicate submissions must not create another link or role assignment.
    await Promise.all(Array.from({length:200},async()=>{
      const input=interaction(0);
      await verifyHandler.handle(input,{namespace:'verify',action:'submit',args:[]},ctx);
      assert.match(input.replyText,/already verified/i);
    }));
    assert.equal(grants,1000);
    const row=(await admin.query(`select count(*)::int total,count(distinct registration_id)::int registrations,
      count(distinct discord_user_id)::int accounts,count(*) filter(where active)::int active
      from discord_bot.participant_links`)).rows[0];
    assert.deepEqual(row,{total:1000,registrations:1000,accounts:1000,active:1000});
    return {passed:true,...timing,source_sha:sourceSha,database_role:'discord_bot_app',pool_connections:10,
      discord_io:'SIMULATED successful calls, 25ms per operation; no live Discord request',
      includes:'actual modal handler, database lookup/link/audit, member fetch, role assignment, confirmation, organizer log',
      duplicate_requests:200,role_grants:grants,integrity:row};
  } finally {await pool.end();}
}
