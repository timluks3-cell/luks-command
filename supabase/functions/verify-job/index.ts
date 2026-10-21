import { json } from '../_shared/backend.ts';
import { verifySavedJob } from '../_shared/verification.ts';
// Gateway JWT verification remains enabled; this endpoint performs no database writes.
export async function handleVerify(req:Request){
  if(req.method==='OPTIONS')return json({ok:true});
  if(req.method!=='POST')return json({error:'POST required'},405);
  let body:any;
  try{body=await req.json();}catch{return json({error:'Invalid JSON'},400);}
  const verification=await verifySavedJob({job_url:body.url,title:body.title,deadline:body.deadline});
  return json(verification);
}
Deno.serve(handleVerify);
