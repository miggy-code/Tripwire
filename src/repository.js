import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {getDb} from './db.js';
import {collectCompany} from './collectors.js';
import {loadProfiles,evaluateEvent} from './profiles.js';

const iso=value=>value?new Date(value).toISOString():null;
const profilesDir=join(process.cwd(),'profiles');
const hash=e=>createHash('sha256').update(JSON.stringify([e.title,e.text,e.url])).digest('hex');
const readProfiles=()=>loadProfiles(profilesDir);
export function validateCompany(c){
 if(!c||!c.id||!c.name||!c.domain||c.verified!==true||c.demo||!Array.isArray(c.boards)||!c.boards.length)throw new Error('Each company requires a verified domain, evidence URL, and at least one board');
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain)||!/^https:\/\//.test(c.verificationUrl||'')||!Number.isFinite(Date.parse(c.verifiedAt)))throw new Error('Company verification evidence is invalid');
 for(const b of c.boards)if(!['ashby','greenhouse','lever'].includes(b.source)||!/^[-a-zA-Z0-9_]+$/.test(b.slug))throw new Error('Unsupported board or invalid board identifier');
 return c;
}
function eventFromRow(row){return {...row.payload,id:row.id,companyId:row.company_id,current:row.current,firstSeen:iso(row.first_seen),lastSeen:iso(row.last_seen),versionObservedAt:iso(row.observed_at)};}
export async function persistBoard(client,company,board,candidates,check,runId){
 await client.query('BEGIN');
 try{
  if(check.status==='success'){
   const baseline=!(await client.query("SELECT 1 FROM collection_checks WHERE company_id=$1 AND source=$2 AND board_slug=$3 AND status='success' LIMIT 1",[company.id,board.source,board.slug])).rowCount;
   for(const event of candidates){
    if(event.demo)throw new Error('Synthetic observations are not accepted by the live repository');
    const args=[company.id,board.source,board.slug,String(event.sourceId)];
    const current=(await client.query('SELECT * FROM observations WHERE company_id=$1 AND source=$2 AND board_slug=$3 AND source_id=$4 AND current',args)).rows[0];
    const fingerprint=hash(event);
    if(current?.content_hash===fingerprint){
     await client.query('UPDATE observations SET last_seen=$2,payload=$3 WHERE id=$1',[current.id,check.checkedAt,JSON.stringify({...event,baseline:current.payload.baseline===true})]);continue;
    }
    const original=(await client.query('SELECT min(first_seen) AS first_seen FROM observations WHERE company_id=$1 AND source=$2 AND board_slug=$3 AND source_id=$4',args)).rows[0]?.first_seen;
    if(current)await client.query('UPDATE observations SET current=false WHERE id=$1',[current.id]);
    await client.query('INSERT INTO observations(id,company_id,source,board_slug,source_id,content_hash,first_seen,observed_at,last_seen,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)',[randomUUID(),...args,fingerprint,original||check.checkedAt,check.checkedAt,JSON.stringify({...event,baseline})]);
   }
   await client.query('UPDATE observations SET current=false WHERE company_id=$1 AND source=$2 AND board_slug=$3 AND current AND NOT(source_id=ANY($4::text[]))',[company.id,board.source,board.slug,candidates.map(e=>String(e.sourceId))]);
  }
  await client.query('INSERT INTO collection_checks(run_id,company_id,source,board_slug,status,checked_at,jobs_observed,error) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[runId,company.id,board.source,board.slug,check.status,check.checkedAt,check.jobsObserved,check.error?.slice(0,500)||null]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function runCollection({companies,fetchImpl}={}){
 const configured=companies||(JSON.parse(await readFile(join(process.cwd(),'config','companies.json'),'utf8')));
 if(!Array.isArray(configured)||!configured.length)throw new Error('No companies configured');
 configured.forEach(validateCompany);
 const client=await getDb().connect();const runId=randomUUID();let locked=false;
 const report={id:runId,successfulBoards:0,failedBoards:0,jobsObserved:0,skipped:false};
 try{
  locked=(await client.query('SELECT pg_try_advisory_lock(76392811) AS locked')).rows[0].locked;
  if(!locked)return {...report,skipped:true};
  await client.query('INSERT INTO collection_runs(id,status) VALUES($1,$2)',[runId,'running']);
  await client.query("UPDATE companies SET payload=jsonb_set(payload,'{active}','false'::jsonb) WHERE NOT(id=ANY($1::text[]))",[configured.map(c=>c.id)]);
  for(const company of configured){
   await client.query('INSERT INTO companies(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()',[company.id,JSON.stringify({...company,active:true})]);
   const events=await collectCompany(company,{...(fetchImpl?{fetchImpl}:{})});
   for(const board of company.boards){
    const check=events.health.find(h=>h.source===board.source&&h.boardSlug===board.slug);
    if(!check)throw new Error('Collector did not report board health');
    await persistBoard(client,company,board,events.filter(e=>e.source===board.source&&e.boardSlug===board.slug),check,runId);
    if(check.status==='success'){report.successfulBoards++;report.jobsObserved+=check.jobsObserved;}else report.failedBoards++;
   }
  }
  await client.query('UPDATE collection_runs SET finished_at=now(),status=$2,successful_boards=$3,failed_boards=$4 WHERE id=$1',[runId,report.failedBoards?(report.successfulBoards?'partial':'failure'):'success',report.successfulBoards,report.failedBoards]);
  return report;
 }catch(error){if(locked)await client.query("UPDATE collection_runs SET finished_at=now(),status='failure',successful_boards=$2,failed_boards=$3 WHERE id=$1",[runId,report.successfulBoards,report.failedBoards]).catch(()=>{});throw error;}
 finally{if(locked)await client.query('SELECT pg_advisory_unlock(76392811)').catch(()=>{});client.release();}
}
/** @param {string | undefined} profileId
 * @param {{tenantId?: string,userId?: string,limit?: number}} options */
export async function getFeed(profileId,{tenantId,userId,limit=200}={}){
 const profiles=await readProfiles();
 if(profileId&&!profiles.some(p=>p.id===profileId))throw Object.assign(new Error('Unknown profile'),{status:400});
 const db=getDb();
 const result=await db.query(`SELECT o.*, c.payload AS company FROM observations o JOIN companies c ON c.id=o.company_id WHERE o.current AND c.payload->>'active'='true' ORDER BY o.observed_at DESC LIMIT 10000`);
 const selected=profiles.filter(p=>!profileId||p.id===profileId);
 const opportunities=[];
 for(const row of result.rows){const event=eventFromRow(row);if(event.demo)continue;for(const profile of selected){const o=evaluateEvent(event,row.company,profile);if(o)opportunities.push({...o,company:row.company,event});}}
 const eventTime=o=>o.event.baseline?(o.event.sourcePublishedAt||o.event.sourceUpdatedAt||o.event.firstSeen):o.event.versionObservedAt;
 opportunities.sort((a,b)=>String(eventTime(b)).localeCompare(String(eventTime(a)))||b.score-a.score);
 const health=await getPublicHealth();
 const feedback=tenantId&&userId?(await db.query('SELECT opportunity_id AS "opportunityId",label,updated_at AS "updatedAt" FROM feedback WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId])).rows:[];
 return {profiles,opportunities:opportunities.slice(0,Math.max(1,Math.min(Number(limit)||200,1000))),health:health.checks,metrics:{...health.metrics,matchingOpportunities:opportunities.length,returnedOpportunities:Math.min(opportunities.length,limit),evaluatedObservations:result.rowCount,evaluationLimit:10000,accuracy:null},feedback};
}
export async function getPublicHealth(){
 const db=getDb();
 const checks=(await db.query(`SELECT DISTINCT ON(company_id,source,board_slug) company_id AS "companyId",source,board_slug AS "boardSlug",status,checked_at AS "checkedAt",jobs_observed AS "jobsObserved",(SELECT max(s.checked_at) FROM collection_checks s WHERE s.company_id=c.company_id AND s.source=c.source AND s.board_slug=c.board_slug AND s.status='success') AS "lastSuccessAt" FROM collection_checks c WHERE EXISTS(SELECT 1 FROM companies active_company WHERE active_company.id=c.company_id AND active_company.payload->>'active'='true') ORDER BY company_id,source,board_slug,checked_at DESC,id DESC`)).rows.map(c=>({...c,checkedAt:iso(c.checkedAt),lastSuccessAt:iso(c.lastSuccessAt),stale:!c.lastSuccessAt||Date.now()-new Date(c.lastSuccessAt).getTime()>24*3600e3}));
 const counts=(await db.query(`SELECT (SELECT count(*)::int FROM companies WHERE payload->>'active'='true') AS companies,(SELECT count(*)::int FROM observations o JOIN companies c ON c.id=o.company_id WHERE o.current AND c.payload->>'active'='true') AS "currentObservations",(SELECT count(*)::int FROM observations) AS "totalObservations"`)).rows[0];
 const latest=(await db.query('SELECT id,started_at AS "startedAt",finished_at AS "finishedAt",status,successful_boards AS "successfulBoards",failed_boards AS "failedBoards" FROM collection_runs ORDER BY started_at DESC LIMIT 1')).rows[0]||null;
 return {checks,metrics:{...counts,successfulBoards:checks.filter(c=>c.status==='success').length,failedBoards:checks.filter(c=>c.status==='failure').length,staleBoards:checks.filter(c=>c.stale).length},latestRun:latest,accuracy:{status:'not evaluated',sampleSize:0},generatedAt:new Date().toISOString()};
}
export async function saveFeedback({tenantId,userId,opportunityId,label}){
 if(!tenantId||!userId||!['relevant','irrelevant'].includes(label))throw Object.assign(new Error('Invalid feedback'),{status:400});
 const profiles=await readProfiles();let matched=false;
 for(const p of profiles){const suffix=`:${p.id}:v${p.version}`;if(!opportunityId.startsWith('opportunity:')||!opportunityId.endsWith(suffix))continue;
  const id=opportunityId.slice('opportunity:'.length,-suffix.length);
  const row=(await getDb().query('SELECT o.*,c.payload AS company FROM observations o JOIN companies c ON c.id=o.company_id WHERE o.id=$1',[id])).rows[0];
  if(row&&evaluateEvent(eventFromRow(row),row.company,p))matched=true;
 }
 if(!matched)throw Object.assign(new Error('Unknown opportunity'),{status:404});
 await getDb().query('INSERT INTO feedback(tenant_id,user_id,opportunity_id,label) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,user_id,opportunity_id) DO UPDATE SET label=EXCLUDED.label,updated_at=now()',[tenantId,userId,opportunityId,label]);
}
