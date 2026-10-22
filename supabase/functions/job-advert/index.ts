import {json} from '../_shared/backend.ts';
import {allowedAdvertJob,publicAdvertFetch,extractAdvert,type Resolver} from '../_shared/job-advert.ts';
const dns:Resolver=async host=>{const answers=await Promise.allSettled([Deno.resolveDns(host,'A'),Deno.resolveDns(host,'AAAA')]);return answers.flatMap(a=>a.status==='fulfilled'?a.value:[]);};
export function advertHandler(env:(key:string)=>string|undefined,fetcher:typeof fetch=fetch,resolve:Resolver=dns){
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return json({ok:true});if(req.method!=='POST')return json({error:'POST required'},405);
  const auth=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(auth))return json({error:'Sign in to retrieve the advert.'},401);
  let body;try{body=await req.json();}catch{return json({error:'Invalid request'},400);}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.job_id||''))return json({error:'A saved vacancy ID is required.'},400);
  const base=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY');if(!base||!key)return json({error:'Advert retrieval is not configured.'},503);
  const headers={apikey:key,Authorization:auth};
  try{
   const who=await fetcher(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});if(!who.ok)return json({error:'Sign in again to retrieve the advert.'},401);const user=await who.json();if(!user.id)return json({error:'Sign in again.'},401);
   const r=await fetcher(base+'/rest/v1/jobs?id=eq.'+encodeURIComponent(body.job_id)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=id,title,job_url,location,status,match_score,verified_open,verified_at,verification_status,deadline',{headers,signal:AbortSignal.timeout(10000)});
   if(!r.ok)return json({error:'Could not read the saved vacancy.'},502);const jobs=await r.json(),job=jobs?.[0];if(!job)return json({error:'Vacancy is not available in your account.'},404);
   if(!allowedAdvertJob(job))return json({error:'Use a Denmark vacancy above 70% match with a current verification and open deadline.'},409);
   const page=await publicAdvertFetch(job.job_url,fetcher,resolve);const advert=extractAdvert(job,page.html,page.url);return json(advert);
  }catch(error){return json({error:error instanceof Error?error.message:'Could not retrieve the full advert.'},422);}
 };
}
if(typeof Deno!=='undefined')Deno.serve(advertHandler(key=>Deno.env.get(key)));
