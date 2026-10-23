import test from 'node:test';
import assert from 'node:assert/strict';

test('PostgreSQL integration: persistence, history, failure safety, isolation and collection lock',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);
 assert.match(url.pathname,/_test$/,'Integration tests require an isolated _test database');
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
 const {getDb,closeDb}=await import('../src/db.js');
 const {migrate}=await import('../src/migrate.js');
 const {runCollection,getFeed,getPublicHealth,saveFeedback}=await import('../src/repository.js');
 await migrate();const db=getDb();
 await db.query('TRUNCATE feedback,collection_checks,collection_runs,observations,companies RESTART IDENTITY CASCADE');
 const companies=[{id:'test-company',name:'Integration test company',domain:'company.test',verified:true,verificationUrl:'https://company.test/careers',verifiedAt:'2026-10-23',boards:[{source:'ashby',slug:'test-company'}]}];
 let jobs=[{id:'job1',title:'Operations lead',descriptionPlain:'Own manual reconciliation and cloud migration across business systems.',jobUrl:'https://company.test/jobs/job1',isListed:true}];
 let fails=false;
 const fetchImpl=async()=>fails?{ok:false,status:503}:{ok:true,status:200,json:async()=>({jobs})};
 try{
  let run=await runCollection({companies,fetchImpl});assert.equal(run.successfulBoards,1);
  let feed=await getFeed(undefined);assert.equal(feed.metrics.currentObservations,1);assert.equal(feed.opportunities.length,2);assert.equal(feed.opportunities[0].event.baseline,true);assert.equal(feed.metrics.accuracy,null);
  const originalId=feed.opportunities[0].event.id;
  await runCollection({companies,fetchImpl});feed=await getFeed(undefined);assert.equal(feed.metrics.totalObservations,1,'unchanged collection must not duplicate');
  await saveFeedback({tenantId:'org:one',userId:'user_a',opportunityId:feed.opportunities[0].id,label:'relevant'});
  assert.equal((await getFeed(undefined,{tenantId:'org:one',userId:'user_a'})).feedback.length,1);
  assert.equal((await getFeed(undefined,{tenantId:'org:two',userId:'user_a'})).feedback.length,0);
  assert.equal((await getFeed(undefined,{tenantId:'org:one',userId:'user_b'})).feedback.length,0);
  jobs=[{...jobs[0],descriptionPlain:'Lead cloud migration and enterprise integration.'}];
  await runCollection({companies,fetchImpl});feed=await getFeed(undefined);assert.equal(feed.metrics.totalObservations,2);assert.equal(feed.metrics.currentObservations,1);assert.notEqual(feed.opportunities[0].event.id,originalId);
  fails=true;run=await runCollection({companies,fetchImpl});assert.equal(run.failedBoards,1);feed=await getFeed(undefined);assert.equal(feed.metrics.currentObservations,1,'failure retains previous postings');
  const health=await getPublicHealth();assert.equal(health.metrics.failedBoards,1);assert.ok(health.checks[0].lastSuccessAt);
  const lock=await db.connect();try{await lock.query('SELECT pg_advisory_lock(76392811)');assert.equal((await runCollection({companies,fetchImpl})).skipped,true);}finally{await lock.query('SELECT pg_advisory_unlock(76392811)');lock.release();}
  fails=false;jobs=[];await runCollection({companies,fetchImpl});assert.equal((await getFeed(undefined)).metrics.currentObservations,0);
  await assert.rejects(()=>saveFeedback({tenantId:'org:one',userId:'user_a',opportunityId:'unknown',label:'relevant'}),/Unknown opportunity/);
  await assert.rejects(()=>runCollection({companies:[{...companies[0],demo:true}],fetchImpl}),/verified domain/);
 }finally{await closeDb();}
});
