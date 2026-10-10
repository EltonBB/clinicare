// Run only from a sanitized snapshot with its own dependencies and production build.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = 55432, httpPort = 3100;
const bin = process.env.QA_POSTGRES_BINARY_ROOT;
const openssl = process.env.QA_OPENSSL_PATH;
const results = [];
const env = Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','APPDATA','LOCALAPPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
async function run(exe, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe,args,{cwd:project,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timeout=setTimeout(()=>child.kill(),300000);timeout.unref();
    let output='';
    child.stdout.on('data', b => output+=b); child.stderr.on('data', b => output+=b);
    child.once('error',error=>{clearTimeout(timeout);reject(error);}); child.once('exit',code=>{clearTimeout(timeout);if(code===0)resolve(output);else reject(new Error(`${path.basename(exe)} exited ${code}: ${output}`));});
  });
}
async function freePort(p) { await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));}); }
async function main() {
  assert.ok(bin && openssl && process.platform==='win32','Provide portable PG and OpenSSL paths.');
  for (const directory of [project,path.join(project,'prisma')]) assert.ok(!(await fs.readdir(directory)).some(name=>{
    const normalized=name.toLowerCase();
    return (normalized==='.env'||normalized.startsWith('.env.'))&&!normalized.endsWith('.example');
  }),'Refusing environment files.');
  await fs.access(path.join(project,'.next','BUILD_ID'));
  await freePort(port); await freePort(httpPort);
  const parent=path.join(project,'.qa-postgres'); await fs.mkdir(parent,{recursive:true});
  assert.equal(await fs.realpath(parent),path.join(await fs.realpath(project),'.qa-postgres'));
  const dir=await fs.mkdtemp(path.join(parent,'http-')), data=path.join(dir,'data');
  assert.equal(path.dirname(await fs.realpath(dir)),await fs.realpath(parent));
  const password=crypto.randomBytes(24).toString('hex'), passwordFile=path.join(dir,'bootstrap-password');
  const url=`postgresql://vela_qa:${password}@127.0.0.1:${port}/vela_mobile_qa`;
  const cert=path.join(dir,'server.crt'), key=path.join(dir,'server.key');
  let started=false, server, pool, db;
  try {
    await fs.writeFile(passwordFile,password,{flag:'wx'});
    await run(path.join(bin,'initdb.exe'),['-D',data,'-U','vela_qa',`--pwfile=${passwordFile}`,'--auth=scram-sha-256','--no-locale','--no-sync','-E','UTF8']);
    await fs.unlink(passwordFile);
    // A one-day QA-only self-signed CA/server cert; trusted only by this process and Next child.
    await run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost','-addext','basicConstraints=critical,CA:TRUE']);
    const ca=await fs.readFile(cert,'utf8');
    await fs.appendFile(path.join(data,'postgresql.conf'),`\nssl=on\nssl_cert_file='${cert.replaceAll('\\','/')}'\nssl_key_file='${key.replaceAll('\\','/')}'\n`);
    await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(dir,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']); started=true;
    const c=new pg.Client({connectionString:url.replace('/vela_mobile_qa','/postgres'),ssl:{ca,rejectUnauthorized:true}});
    await c.connect();
    const tls=(await c.query('select ssl, version, cipher from pg_stat_ssl where pid=pg_backend_pid()')).rows[0]; assert.equal(tls.ssl,true);
    await c.query('CREATE DATABASE vela_mobile_qa'); await c.end();
    Object.assign(env,{NODE_ENV:'production',DATABASE_URL:url,DIRECT_URL:url,DATABASE_SSL_CA:ca,DATABASE_SSL_REJECT_UNAUTHORIZED:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'qa-unused-public-key',APP_URL:`http://127.0.0.1:${httpPort}`,NEXT_PUBLIC_APP_URL:`http://127.0.0.1:${httpPort}`,NEXT_TELEMETRY_DISABLED:'1'});
    await run(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate','--schema','prisma/schema.prisma']);
    pool=new pg.Pool({connectionString:url,ssl:{ca,rejectUnauthorized:true},max:10});
    db=new PrismaClient({adapter:new PrismaPg(pool,{disposeExternalPool:true})});
    assert.equal(await db.business.count(),0);
    const a=await db.business.create({data:{ownerId:'fictional-http-owner-a',name:'Fictional HTTP Clinic A',businessType:'QA',plan:'PRO'}});
    const b=await db.business.create({data:{ownerId:'fictional-http-owner-b',name:'Fictional HTTP Clinic B',businessType:'QA'}});
    const staff=await db.staffMember.create({data:{businessId:a.id,name:'Fictional HTTP Doctor',role:'Doctor'}});
    const peer=await db.staffMember.create({data:{businessId:a.id,name:'Fictional HTTP Peer',role:'Doctor'}});
    const foreign=await db.staffMember.create({data:{businessId:b.id,name:'Fictional HTTP Foreign',role:'Doctor'}});
    const client=await db.client.create({data:{businessId:a.id,name:'Fictional HTTP Patient',phone:'+00000001111'}});
    const futureStart=new Date();futureStart.setUTCDate(futureStart.getUTCDate()+2);futureStart.setUTCHours(12,0,0,0);
    await db.businessHours.createMany({data:Array.from({length:7},(_,weekday)=>({businessId:a.id,weekday,startTime:'00:00',endTime:'23:59'}))});
    const appointment=await db.appointment.create({data:{businessId:a.id,staffMemberId:staff.id,clientId:client.id,title:'Fictional HTTP Visit',startAt:futureStart,endAt:new Date(futureStart.getTime()+1800000),status:'CONFIRMED'}});
    await db.appointmentReminder.create({data:{appointmentId:appointment.id,type:'TWO_HOUR'}});
    const waitingClient=await db.client.create({data:{businessId:a.id,name:'Fictional HTTP Waiting Patient',phone:'+00000002222'}});
    const waitlistEntry=await db.waitlistEntry.create({data:{businessId:a.id,clientId:waitingClient.id,staffMemberId:staff.id,service:appointment.title}});
    const other=await db.appointment.create({data:{businessId:a.id,staffMemberId:peer.id,clientId:client.id,title:'Fictional HTTP Peer Visit',startAt:new Date(),endAt:new Date(Date.now()+1800000)}});
    const foreignThread=await db.staffThread.create({data:{businessId:b.id,staffMemberId:foreign.id}});
    // Use a 12-character alphabet subset accepted unchanged by production normalization.
    const code=crypto.randomBytes(6).toString('hex').toUpperCase();
    const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
    await db.staffAccessCode.create({data:{businessId:a.id,staffMemberId:staff.id,codeHash:hash(code),expiresAt:new Date(Date.now()+3600000)}});
    const log=await fs.open(path.join(dir,'next.log'),'a');
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(httpPort)],{cwd:project,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
    let serverError;server.once('error',error=>{serverError=error;});
    await log.close();
    const base=`http://127.0.0.1:${httpPort}/api/mobile/v1/`;
    let ready=false;
    const readyDeadline=Date.now()+180000; while(Date.now()<readyDeadline){if(serverError)throw serverError;if(server.exitCode!==null)throw new Error(`Next exited ${server.exitCode}; inspect next.log`);try{const r=await fetch(base+'me',{signal:AbortSignal.timeout(30000)});if(r.status===401){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,250));}
    assert.ok(ready,'Next failed to become ready; inspect next.log');
    let token;
    async function req(route,{method='GET',body,raw,auth=token,headers={}}={}) {
      return fetch(base+route,{signal:AbortSignal.timeout(15000),method,headers:{origin:'http://localhost:8083',...(auth?{authorization:`Bearer ${auth}`} : {}),...(body!==undefined||raw!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{})});
    }
    async function test(name,fn){await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}
    function headers(r){assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');}
    await test('preflight passes through listening Next proxy',async()=>{const r=await req('me',{method:'OPTIONS',auth:'',headers:{'access-control-request-method':'GET','access-control-request-headers':'authorization'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('access-control-allow-headers'),/Authorization/);});
    await test('unauthenticated HTTP is JSON 401 with CORS and private no-store',async()=>{const r=await req('me',{auth:''});assert.equal(r.status,401);headers(r);assert.equal((await r.json()).error,'Unauthorized.');});
    await test('HTTP enrollment reaches real Prisma TLS Postgres and returns profile',async()=>{const r=await req('auth/redeem',{method:'POST',auth:'',body:{code,platform:'ios',deviceLabel:'Fictional HTTP QA device'}});assert.equal(r.status,200);headers(r);const j=await r.json();token=j.token;assert.ok(token);assert.equal(j.me.id,staff.id);const d=await db.staffDevice.findUniqueOrThrow({where:{tokenHash:hash(token)}});assert.notEqual(d.tokenHash,token);});
    await test('authenticated HTTP profile resolves normal production Prisma seam',async()=>{const r=await req('me');assert.equal(r.status,200);headers(r);assert.equal((await r.json()).me.id,staff.id);});
    await test('HTTP same-clinic peer and foreign thread reads do not cross ownership',async()=>{for(const route of [`appointments/${other.id}`,`threads/${foreignThread.id}`]){const r=await req(route);assert.equal(r.status,404);headers(r);}});
    await test('HTTP refuses to cancel a recorded no-show and preserves its mobile status contract',async()=>{
      const noShow=await db.appointment.create({data:{businessId:a.id,staffMemberId:staff.id,clientId:client.id,title:'Fictional HTTP No-show',startAt:new Date(Date.now()-3600000),endAt:new Date(Date.now()-1800000),status:'NO_SHOW'}});
      const r=await req(`appointments/${noShow.id}/cancel`,{method:'POST',body:{}});assert.equal(r.status,409);headers(r);
      const unchanged=await db.appointment.findUniqueOrThrow({where:{id:noShow.id}});assert.equal(unchanged.status,'NO_SHOW');assert.equal(unchanged.cancelledAt,null);assert.equal(unchanged.reminderGeneration,0);
      const detail=await req(`appointments/${noShow.id}`);assert.equal(detail.status,200);assert.equal((await detail.json()).appointment.status,'cancelled');
      assert.equal(await db.staffThreadMessage.count({where:{sender:'SYSTEM'}}),0);assert.equal(await db.followUpDraft.count(),0);
    });
    await test('concurrent HTTP cancellation persists one notice, reset and pending Pro slot-offer draft',async()=>{
      const responses=await Promise.all(Array.from({length:5},()=>req(`appointments/${appointment.id}/cancel`,{method:'POST',body:{}})));assert.ok(responses.every(r=>r.status===200));
      const cancelled=await db.appointment.findUniqueOrThrow({where:{id:appointment.id}});assert.equal(cancelled.status,'CANCELLED');assert.ok(cancelled.cancelledAt instanceof Date);assert.deepEqual(cancelled.cancelledScheduledStartAt,appointment.startAt);assert.equal(cancelled.reminderGeneration,1);assert.equal(await db.appointmentReminder.count({where:{appointmentId:appointment.id}}),0);
      assert.equal(await db.staffThreadMessage.count({where:{sender:'SYSTEM'}}),1);assert.equal(await db.staffNotification.count({where:{title:'Cancellation sent'}}),1);
      const drafts=await db.followUpDraft.findMany();assert.equal(drafts.length,1);assert.equal(drafts[0].kind,'SLOT_OFFER');assert.equal(drafts[0].status,'PENDING');assert.equal(drafts[0].sentAt,null);assert.equal(drafts[0].clientId,waitingClient.id);assert.equal(drafts[0].appointmentId,appointment.id);assert.equal(drafts[0].waitlistEntryId,waitlistEntry.id);assert.ok(drafts[0].body.includes(waitingClient.name));assert.ok(!drafts[0].body.includes(appointment.title));assert.equal((await db.waitlistEntry.findUniqueOrThrow({where:{id:waitlistEntry.id}})).status,'OFFERED');
    });
    await test('concurrent HTTP sends share one thread and preserve every unread increment',async()=>{const before=await db.staffThread.findUniqueOrThrow({where:{businessId_staffMemberId:{businessId:a.id,staffMemberId:staff.id}}});const responses=await Promise.all(Array.from({length:5},(_,i)=>req('threads/admin/messages',{method:'POST',body:{body:`Fictional concurrent HTTP message ${i}`}})));assert.ok(responses.every(r=>r.status===200));assert.equal(await db.staffThread.count({where:{businessId:a.id,staffMemberId:staff.id}}),1);const after=await db.staffThread.findUniqueOrThrow({where:{id:before.id}});assert.equal(after.unreadForAdmin,before.unreadForAdmin+5);});
    await test('HTTP malformed and oversized JSON stop at request boundary',async()=>{assert.equal((await req('threads/admin/messages',{method:'POST',raw:'{'})).status,400);assert.equal((await req('threads/admin/messages',{method:'POST',raw:JSON.stringify({body:'x'.repeat(40000)})})).status,413);});
    await test('HTTP snapshot acknowledgment preserves unseen arrivals, capped history and retries',async()=>{
      const thread=await db.staffThread.findUniqueOrThrow({where:{businessId_staffMemberId:{businessId:a.id,staffMemberId:staff.id}}});
      const start=Date.now();
      await db.staffThreadMessage.createMany({data:Array.from({length:110},(_,i)=>({threadId:thread.id,sender:'ADMIN',body:`Fictional capped unread ${i}`,createdAt:new Date(start+i)}))});
      await db.staffThread.update({where:{id:thread.id},data:{unreadForStaff:110}});
      const snapshot=await (await req('threads/admin')).json();assert.equal(snapshot.conversation.messages.length,100);
      const newest=await db.staffThreadMessage.create({data:{threadId:thread.id,sender:'ADMIN',body:'Fictional post-snapshot arrival',createdAt:new Date(start+200)}});
      await db.staffThread.update({where:{id:thread.id},data:{unreadForStaff:{increment:1}}});
      const seenMessageIds=snapshot.conversation.messages.map(m=>m.id);
      const responses=await Promise.all(Array.from({length:5},()=>req('threads/admin/read',{method:'POST',body:{seenMessageIds}})));
      for(const r of responses){assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,unreadCount:11});}
      assert.equal((await db.staffThreadMessage.findUniqueOrThrow({where:{id:newest.id}})).readAt,null);
      assert.equal((await db.staffThread.findUniqueOrThrow({where:{id:thread.id}})).unreadForStaff,11);
    });
    await test('HTTP read selections reject malformed and foreign IDs without partial receipts',async()=>{
      const own=await db.staffThreadMessage.findFirstOrThrow({where:{thread:{businessId:a.id,staffMemberId:staff.id},sender:'ADMIN',readAt:null}});
      const foreignMessage=await db.staffThreadMessage.create({data:{threadId:foreignThread.id,sender:'ADMIN',body:'Fictional foreign receipt'}});
      for(const body of [{seenMessageIds:[own.id,foreignMessage.id]},{seenMessageIds:['unknown-id']},{seenMessageIds:Array(101).fill(own.id)},{seenMessageIds:['bad/id']},{}]){
        const r=await req('threads/admin/read',{method:'POST',body});assert.equal(r.status,400);headers(r);
      }
      assert.equal((await req('threads/admin/read',{method:'POST',raw:'{'})).status,400);
      assert.equal((await req('threads/admin/read',{method:'POST',raw:' '})).status,400);
      assert.equal((await req('threads/admin/read',{method:'POST',body:{seenMessageIds:['x'.repeat(33000)]}})).status,413);
      assert.equal((await req(`threads/${foreignThread.id}/read`,{method:'POST',body:{seenMessageIds:[foreignMessage.id]}})).status,404);
      assert.equal(await db.staffThreadMessage.count({where:{id:{in:[own.id,foreignMessage.id]},readAt:null}}),2);
    });
    await test('HTTP empty seen selection is no-op and explicit legacy mark-all clears hidden history',async()=>{
      const empty=await req('threads/admin/read',{method:'POST',body:{seenMessageIds:[]}});assert.deepEqual(await empty.json(),{ok:true,unreadCount:11});
      const all=await req('threads/admin/read',{method:'POST'});assert.equal(all.status,200);assert.deepEqual(await all.json(),{ok:true,unreadCount:0});
      const thread=await db.staffThread.findUniqueOrThrow({where:{businessId_staffMemberId:{businessId:a.id,staffMemberId:staff.id}}});
      assert.equal(await db.staffThreadMessage.count({where:{threadId:thread.id,sender:'ADMIN',readAt:null}}),0);
    });    await test('staff deactivation is reflected on next HTTP request',async()=>{await db.staffMember.update({where:{id:staff.id},data:{isActive:false}});assert.equal((await req('me')).status,401);await db.staffMember.update({where:{id:staff.id},data:{isActive:true}});assert.equal((await req('me')).status,200);});
    await test('HTTP device rate limit exposes Retry-After across CORS',async()=>{let last;for(let i=0;i<65;i++){last=await req('me');if(last.status===429)break;}assert.equal(last.status,429);assert.ok(Number(last.headers.get('retry-after'))>0);assert.equal(last.headers.get('access-control-expose-headers'),'Retry-After');headers(last);});
    await test('logout revokes token before subsequent HTTP reads',async()=>{assert.equal((await req('auth/logout',{method:'POST',body:{}})).status,200);assert.equal((await req('appointments')).status,401);});
    const evidence={date:new Date().toISOString(),next:JSON.parse(await fs.readFile(path.join(project,'node_modules/next/package.json'),'utf8')).version,node:process.version,listener:`127.0.0.1:${httpPort}`,postgresListener:`127.0.0.1:${port}`,tls,serverEntry:'next start',normalPrismaSeam:true,mocks:false,fictionalDataOnly:true,results,boundaries:['Fresh schema via db push; production RLS/deployment SQL not exercised','Redis absent: per-process fallback limiter','No browser, mobile-native runtime, external auth, storage or push provider exercised'],runDirectory:dir};
    await fs.writeFile(path.join(dir,'http-results.json'),JSON.stringify(evidence,null,2));
    await fs.mkdir(path.join(project,'qa/evidence'),{recursive:true}); await fs.writeFile(path.join(project,`qa/evidence/mobile-http-postgres-${new Date().toISOString().slice(0,10)}.json`),JSON.stringify(evidence,null,2));
    console.log(`HTTP evidence: ${path.join(dir,'http-results.json')}`);
    if(process.env.QA_HTTP_HOLD==='1') {
      const browserCode=crypto.randomBytes(6).toString('hex').toUpperCase();
      await db.staffAccessCode.create({data:{businessId:a.id,staffMemberId:staff.id,codeHash:hash(browserCode),expiresAt:new Date(Date.now()+1800000)}});
      await db.staffShift.create({data:{businessId:a.id,staffMemberId:staff.id,startsAt:new Date(Date.now()-600000),endsAt:new Date(Date.now()+3600000)}});
      // This is fixture setup after the assertions, not an application mutation:
      // retire the tested offer before restoring its cancelled appointment.
      await db.$transaction([
        db.followUpDraft.updateMany({where:{appointmentId:appointment.id,kind:'SLOT_OFFER',status:{in:['PENDING','SENT']}},data:{status:'EXPIRED'}}),
        db.waitlistEntry.update({where:{id:waitlistEntry.id},data:{status:'WAITING'}}),
        db.appointment.update({where:{id:appointment.id},data:{status:'CONFIRMED',cancelledAt:null,cancelledScheduledStartAt:null,reminderGeneration:{increment:1}}}),
      ]);
      await fs.writeFile(path.join(dir,'browser-fixture.json'),JSON.stringify({baseUrl:`http://127.0.0.1:${httpPort}`,code:browserCode,staffId:staff.id,businessId:a.id}));
      console.log('Holding local QA listeners for browser coordination.');
      await new Promise(resolve=>{const deadline=setTimeout(()=>{clearInterval(watch);resolve();},1800000);const watch=setInterval(async()=>{if(await fs.stat(path.join(dir,'stop-request')).catch(()=>null)){clearTimeout(deadline);clearInterval(watch);resolve();}},1000);process.once('SIGINT',()=>{clearTimeout(deadline);clearInterval(watch);resolve();});process.once('SIGTERM',()=>{clearTimeout(deadline);clearInterval(watch);resolve();});});
    }
  } finally {
    await fs.unlink(passwordFile).catch(()=>{});
    if(server && server.exitCode===null){server.kill();await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,5000).unref();});}
    const cleanupErrors=[];
    if(db)await db.$disconnect().catch(error=>cleanupErrors.push(error));
    if(started)await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']).catch(error=>cleanupErrors.push(error));
    if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Owned HTTP/PostgreSQL cleanup failed; inspect the owned run directory.');
    console.log('Owned HTTP and PostgreSQL listeners stopped; fictional artifacts retained.');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
