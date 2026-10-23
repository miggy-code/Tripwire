import {getPublicHealth} from '../../../src/repository.js';
export const dynamic='force-dynamic';
export async function GET(){
 try{return Response.json(await getPublicHealth(),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({status:'unavailable',message:'Collection status is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
