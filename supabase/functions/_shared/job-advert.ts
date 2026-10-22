import { inDenmark, jobPostingEvidence, strip } from './scan-core.ts';
import { classifyVacancy } from './verification.ts';
export function allowedAdvertJob(job:any,now=Date.now()){
 const v=Date.parse(job?.verified_at||''),d=Date.parse(job?.deadline||'');
 return !!job&&inDenmark(job.location,job.country)&&typeof job.match_score==='number'&&job.match_score>70&&job.match_score<=100&&job.verified_open===true&&!['closed','expired','dismissed'].includes(job.status)&&!['closed','expired'].includes(job.verification_status)&&Number.isFinite(v)&&v<=now&&now-v<=604800000&&(!Number.isFinite(d)||d>=now);
}
export function publicAddress(ip:string){
 if(ip.includes(':'))return /^[23][0-9a-f]{0,3}:/i.test(ip)&&!/^2001:(?:db8|0*0|0*2|1[0-9a-f]):/i.test(ip)&&!/^2002:/i.test(ip);
 const a=ip.split('.').map(Number);if(a.length!==4||a.some(x=>!Number.isInteger(x)||x<0||x>255))return false;
 return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&(a[1]===168||a[1]===0||a[1]===2)||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&[18,19,51].includes(a[1])||a[0]===203&&a[1]===0&&a[2]===113);
}
export function advertUrl(raw:string){
 const u=new URL(raw);const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!host.includes('.')||/[\[\]:]/.test(host)||/^(?:\d+\.){3}\d+$/.test(host)||/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host))throw Error('A public employer vacancy URL is required.');
 return u;
}
export type Resolver=(host:string)=>Promise<string[]>;
export async function publicAdvertFetch(raw:string,fetcher:typeof fetch,resolve:Resolver){
 let url=advertUrl(raw).href;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  for(let hop=0;hop<4;hop++){
   const u=advertUrl(url),ips=await resolve(u.hostname.replace(/\.$/,''));if(!ips.length||ips.some(ip=>!publicAddress(ip)))throw Error('Vacancy host did not resolve to public addresses.');
   const r=await fetcher(u.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'LUKS-Command/1.0 (vacancy text retrieval)'}});
   if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel();if(!next)throw Error('Vacancy redirect has no destination.');url=new URL(next,u).href;continue;}
   if(!r.ok){await r.body?.cancel();throw Error('Employer page returned HTTP '+r.status+'. Open the original advert if access is restricted.');}
   if(!/text\/html|application\/xhtml/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('The employer did not return an HTML vacancy.');}
   const reader=r.body?.getReader();if(!reader)throw Error('Employer page is empty.');let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>900000){await reader.cancel();throw Error('Employer page exceeds the retrieval size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
   const data=new Uint8Array(size);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.length;}
   return {html:new TextDecoder().decode(data),url:u.href};
  }
  throw Error('Too many employer redirects.');
 }finally{clearTimeout(timer);}
}
function decode(s:string){return s.replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}).replace(/&(?:aelig|oslash|aring|AElig|Oslash|Aring);/g,x=>({'&aelig;':'æ','&oslash;':'ø','&aring;':'å','&AElig;':'Æ','&Oslash;':'Ø','&Aring;':'Å'}[x]||x)).replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
export function advertText(html:string){
 return decode(strip(html.replace(/<(script|style|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(?:p|h[1-6]|div|li|section)>|<br\s*\/?>/gi,' LUKS_LINE_BREAK '))).replace(/\s*LUKS_LINE_BREAK\s*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function block(html:string,pattern:RegExp){
 const m=pattern.exec(html);if(!m)return '';const tag=m[1],start=m.index+m[0].length;let depth=1;const tags=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');tags.lastIndex=start;let t;
 while((t=tags.exec(html))){depth+=t[0].startsWith('</')?-1:1;if(!depth)return html.slice(start,t.index);}return '';
}
export function extractAdvert(job:any,html:string,url:string,now=Date.now()){
 const verdict=classifyVacancy(job,html,url,200,now);
 if(verdict.status!=='open'&&verdict.reason!=='No clear live application signal')throw Error(verdict.reason);
 const evidence=jobPostingEvidence(html);if(evidence.ambiguous)throw Error('Employer page contains more than one vacancy.');
 if(evidence.location&&!inDenmark(evidence.location,evidence.country))throw Error('The live vacancy location is not Denmark-only.');
 const postings:any[]=[];function visit(x:any){if(Array.isArray(x)){x.forEach(visit);return;}if(!x||typeof x!=='object')return;const t=Array.isArray(x['@type'])?x['@type']:[x['@type']];if(t.includes('JobPosting')||t.includes('https://schema.org/JobPosting'))postings.push(x);if(x['@graph'])visit(x['@graph']);}
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(m[1]));}catch{}}
 let content=postings.length===1&&typeof postings[0].description==='string'?postings[0].description:'';
 if(!content)content=block(html,/<(div|section)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:csa_jobadText|job-description|jobDescription|job_description|vacancy-description)[^"']*["'][^>]*>/i);
 if(!content)content=block(html,/<(article)\b[^>]*>/i);
 if(!content)content=block(html,/<(main)\b[^>]*>/i);
 const text=advertText(content);if(text.length<500||text.length>60000)throw Error('The full advert could not be extracted reliably. Open the original advert and paste its text.');
 if(/verify you are human|checking your browser|captcha|access denied/i.test(text))throw Error('Employer access restriction. Open the original advert.');
 return {text,source_url:url,fetched_at:new Date(now).toISOString()};
}
