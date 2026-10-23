import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {getDb,closeDb} from './db.js';
export async function migrate(){
 const client=await getDb().connect();
 try{
  await client.query('SELECT pg_advisory_lock(76392810)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=new URL('../migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()){
   if((await client.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rowCount)continue;
   await client.query('BEGIN');
   try{await client.query(await readFile(new URL(name,dir),'utf8'));await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);await client.query('COMMIT');}
   catch(error){await client.query('ROLLBACK');throw error;}
  }
 }finally{await client.query('SELECT pg_advisory_unlock(76392810)').catch(()=>{});client.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){migrate().then(()=>console.log('Database migrations applied')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closeDb);}
