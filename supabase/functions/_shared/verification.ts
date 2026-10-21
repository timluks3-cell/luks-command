import { jobPostingEvidence, genericListing, strip, CLOSED_WORDS } from './scan-core.ts';
export type Verification = { status: string; verified_open: boolean; conclusive: boolean; reason: string; verified_at?: string };
const result=(status:string,reason:string,conclusive=false,now=Date.now()):Verification=>({status,reason,conclusive,verified_open:status==='open',...(conclusive?{verified_at:new Date(now).toISOString()}: {})});
export function publicJobUrl(raw:string){
  try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!/^(localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(u.hostname);}catch{return false;}
}
export function classifyVacancy(job:any,html:string,finalUrl:string,httpStatus=200,now=Date.now()):Verification{
  if(httpStatus===404||httpStatus===410)return result('closed','Vacancy URL returns HTTP '+httpStatus,true,now);
  if([401,403,429].includes(httpStatus))return result('blocked','Provider access restriction: HTTP '+httpStatus);
  if(httpStatus<200||httpStatus>=300)return result('error','Provider returned HTTP '+httpStatus);
  const plain=strip(html).toLowerCase();
  if(/verify you are human|checking your browser|access denied|captcha/.test(plain))return result('blocked','Provider verification or access challenge');
  const evidence=jobPostingEvidence(html);
  const deadline=Date.parse(evidence.deadline||job.deadline||'');
  if(Number.isFinite(deadline)&&deadline<now)return result('expired','Application deadline has passed',true,now);
  if(CLOSED_WORDS.some(x=>plain.includes(x))||/not currently accepting applications|modtager ikke længere ansøgninger|stillingen er lukket/.test(plain))return result('closed','Live vacancy indicates applications are closed',true,now);
  if(evidence.ambiguous||genericListing(job.title||'',finalUrl)||/^(job hos os|læs mere her|job opportunity)$/i.test(String(job.title||'').trim()))return result('unverified','Page is not an identifiable single vacancy');
  const title=evidence.title||strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'');
  const words=String(job.title||'').toLowerCase().match(/[\p{L}\d]{3,}/gu)||[];
  const key=words.filter((x:string)=>!['til','med','the','and','for','hos','samt','søges'].includes(x));
  const overlap=key.filter((word:string)=>title.toLowerCase().includes(word)).length;
  if(!key.length||overlap<Math.min(2,key.length))return result('unverified','Live heading does not identify the saved vacancy');
  if(!/apply now|apply for (this )?job|submit application|søg jobbet|ansøg nu|ansøg her|send (din )?ansøgning/.test(plain))return result('unverified','No clear live application signal');
  return result('open','Specific live vacancy with matching title and application signal',true,now);
}
export async function verifySavedJob(job:any,fetcher:typeof fetch=fetch,now=Date.now()):Promise<Verification>{
  if(!publicJobUrl(String(job.job_url||'')))return result('error','A public HTTP(S) vacancy URL is required');
  const deadline=Date.parse(job.deadline||'');
  if(Number.isFinite(deadline)&&deadline<now)return result('expired','Stored application deadline has passed',true,now);
  try{
    const response=await fetcher(job.job_url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/xhtml+xml'}});
    if(response.url&&!publicJobUrl(response.url))return result('error','Vacancy redirected to a non-public URL');
    const html=(await response.text()).slice(0,900000);
    return classifyVacancy(job,html,response.url||job.job_url,response.status,now);
  }catch{return result('error','Live page could not be fetched within the verification budget');}
}
