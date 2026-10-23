import pg from 'pg';
let pool;
export function getDb(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required. Configure PostgreSQL before starting collection.');
 if(!pool)pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:30000,application_name:'tripwire'});
 return pool;
}
export async function closeDb(){if(pool){await pool.end();pool=undefined;}}
