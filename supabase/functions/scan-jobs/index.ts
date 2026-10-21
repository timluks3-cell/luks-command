
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const BASE_ROLE_TERMS = [
  "bygningskonstruktør","bim","bim coordinator","bim-koordinator","ikt","ikt-koordinator",
  "revit","teknisk designer","architectural technologist","digital construction","vdc",
  "4d planner","bim specialist","bim modeller","technical designer","design coordinator",
  "technical coordinator","project coordinator","projektkoordinator","projektleder",
  "project manager","junior project manager","byggeleder","navisworks","dalux"
];

const EXCLUDED_POSITION_TERMS = [
  "intern","internship","student","student worker","student assistant","graduate programme","graduate program",
  "graduate trainee","trainee","praktik","praktikant","praktikplads","studentermedhj","elev","elevplads",
  "apprentice","apprenticeship","thesis student","phd student","working student"
];

const GENERIC_LISTING_TITLES = [
  "se ledige stillinger","ledige stillinger","se alle ledige jobs","se alle jobs","all jobs","jobs",
  "careers","career","karriere","dine muligheder","apply","job opportunities","open positions",
  "vacancies","ledige jobs"
];

const JOB_WORDS = [
  "job","jobs","career","careers","vacancy","vacancies","position","positions","stilling",
  "stillinger","ledige","karriere","work with us","join us","apply","ansøg","søg jobbet"
];

const CLOSED_WORDS = [
  "not accepting applications","no longer accepting applications","applications closed",
  "job has expired","position has been filled","job unavailable","stillingen er besat",
  "ansøgningsfristen er udløbet","søgefristen er udløbet","stillingen er ikke længere ledig"
];

const ATS_HOST_HINTS = [
  "csod.com","teamtailor.com","workdayjobs.com","myworkdayjobs.com","greenhouse.io",
  "lever.co","smartrecruiters.com","elvium.com","hirehive.com","jobylon.com"
];

const strip = (s:string) => s
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]*>/g," ")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&#39;/g,"'")
  .replace(/&quot;/gi,'"')
  .replace(/\s+/g," ")
  .trim();

const norm = (s:string) => strip(s || "").toLowerCase();

function normalizeUrl(raw:string, sourceName:string){
  const val=(raw||"").trim();
  if(sourceName.toLowerCase()==="nne" || val.toLowerCase()==="nne.com" || val.toLowerCase()==="www.nne.com"){
    return "https://nne.csod.com/ux/ats/careersite/4/home?c=nne";
  }
  if(!val || /^target:/i.test(val)) return "";
  if(/^https?:\/\//i.test(val)) return val;
  return "https://"+val.replace(/^\/+/, "");
}

function hostOf(url:string){
  try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"")}catch{return ""}
}

function isCsod(url:string){
  try{
    const u=new URL(url);
    return (u.hostname==="csod.com" || u.hostname.endsWith(".csod.com")) &&
      /\/ux\/ats\/careersite\/\d+/i.test(u.pathname);
  }catch{return false}
}

function resolveCsod(url:string){
  try{
    const u=new URL(url);
    const m=u.pathname.match(/\/ux\/ats\/careersite\/(\d+)/i);
    if(!m) return null;
    const siteId=Number(m[1]);
    const corpName=u.searchParams.get("c") || u.hostname.split(".")[0];
    return {
      origin:u.origin,siteId,corpName,
      homeUrl:`${u.origin}/ux/ats/careersite/${siteId}/home?c=${encodeURIComponent(corpName)}`,
      searchApi:`${u.origin}/services/x/career-site/v1/search`
    };
  }catch{return null}
}

function cookieHeader(res:Response){
  try{
    const h:any=res.headers;
    const list=typeof h.getSetCookie==="function" ? h.getSetCookie() : [];
    const jar=new Map<string,string>();
    for(const raw of list){
      const pair=String(raw).split(";",1)[0].trim();
      const i=pair.indexOf("=");
      if(i>0) jar.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());
    }
    return [...jar].map(([k,v])=>`${k}=${v}`).join("; ");
  }catch{return ""}
}

async function fetchResponse(url:string, opts:RequestInit={}, timeout=12000){
  const ctl=new AbortController();
  const id=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{
      ...opts,signal:ctl.signal,redirect:opts.redirect||"follow",
      headers:{
        "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(opts.headers||{})
      }
    });
    return r;
  }finally{clearTimeout(id)}
}

async function fetchText(url:string, timeout=10000){
  try{
    const r=await fetchResponse(url,{},timeout);
    const text=await r.text();
    return {ok:r.ok,status:r.status,url:r.url,text:text.slice(0,900000)};
  }catch(e){return {ok:false,status:0,url,text:"",error:String(e)}}
}

function decodeDuck(href:string){
  try{
    if(href.startsWith("//")) href="https:"+href;
    const u=new URL(href,"https://duckduckgo.com");
    const uddg=u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : u.href;
  }catch{return href}
}

function extractSearchResults(html:string){
  const out:{title:string,url:string}[]=[];
  const patterns=[
    /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  ];
  for(const re of patterns){
    let m;
    while((m=re.exec(html)) && out.length<25){
      const url=decodeDuck(m[1]);
      const title=strip(m[2]);
      if(url.startsWith("http") && !out.some(x=>x.url===url)) out.push({title,url});
    }
    if(out.length) break;
  }
  return out;
}

async function webSearch(query:string){
  const urls=[
    "https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),
    "https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(query),
    "https://www.bing.com/search?q="+encodeURIComponent(query)
  ];
  for(const u of urls){
    const r=await fetchText(u,12000);
    if(!r.ok) continue;
    const rows=extractSearchResults(r.text);
    if(rows.length) return rows;
  }
  return [];
}

function extractAnchors(html:string, base:string){
  const out:{title:string,url:string}[]=[];
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html)) && out.length<300){
    try{
      const url=new URL(m[1],base).href;
      if(!/^https?:/i.test(url)) continue;
      const title=strip(m[2]).slice(0,240);
      if(title || /job|career|position|vacan|stilling|karriere|requisition/i.test(url)) out.push({title,url});
    }catch{}
  }
  return out;
}

function roleTerms(profile:any){
  const vals=[...BASE_ROLE_TERMS];
  for(const x of (Array.isArray(profile?.preferred_roles)?profile.preferred_roles:[])){
    const s=String(x||"").trim().toLowerCase();
    if(s.length>=3) vals.push(s);
  }
  return [...new Set(vals)];
}

function excludedPosition(title:string,text=""){
  const t=(title+" "+text).toLowerCase();
  return EXCLUDED_POSITION_TERMS.some(x=>t.includes(x));
}

function genericListing(title:string,url:string){
  const t=(title||"").trim().toLowerCase();
  if(GENERIC_LISTING_TITLES.includes(t)) return true;
  try{
    const u=new URL(url);
    const path=u.pathname.replace(/\/+$/,"").toLowerCase();
    const genericPaths=["","/job","/jobs","/career","/careers","/karriere","/ledige-stillinger","/vacancies","/positions"];
    if(genericPaths.includes(path)) return true;
  }catch{}
  return false;
}

function roleRelevant(title:string,text:string,terms:string[]){
  const t=(title+" "+text).toLowerCase();
  if(excludedPosition(title,text)) return false;
  return terms.some(x=>x && t.includes(x));
}

function jobLinkLikely(title:string,url:string){
  const t=(title+" "+url).toLowerCase();
  return JOB_WORDS.some(x=>t.includes(x)) || ATS_HOST_HINTS.some(h=>hostOf(url).endsWith(h));
}

function matchScore(text:string,title:string){
  const t=(title+" "+text).toLowerCase();
  let score=45;
  const weighted:[string,number][]=[
    ["revit",8],["navisworks",8],["bim",8],["clash",5],["dalux",4],["acc",4],
    ["bim 360",4],["ifc",3],["technical documentation",3],["teknisk",3],
    ["bygningskonstruktør",8],["architectural technologist",8],["gmp",5],
    ["pharma",4],["project coordinator",3],["project manager",4],["projektleder",4],
    ["4d",3],["pyrevit",3],["digital construction",4],["vdc",4]
  ];
  for(const [k,w] of weighted) if(t.includes(k)) score+=w;
  return Math.min(98,score);
}

const DK_CITIES = ["denmark","danmark","københavn","copenhagen","sjælland","zealand","jylland","jutland","fyn","funen","ishøj","greve","taastrup","hvidovre","brøndby","herlev","ballerup","roskilde","køge","holbæk","ringsted","næstved","slagelse","kalundborg","odense","svendborg","fredericia","vejle","kolding","esbjerg","aarhus","århus","randers","silkeborg","viborg","horsens","aalborg","ålborg","hjørring","frederikshavn","herning","holstebro","sønderborg","haderslev","aabenraa","vordingborg","bornholm","rønne","glostrup","rødovre","frederiksberg","lyngby","hillerød","helsingør","gentofte","kastrup","farum","hørsholm","solrød","allerød"];
const OTHER_COUNTRIES = ["sweden","sverige","norway","norge","germany","deutschland","finland","poland","netherlands","holland","belgium","france","spain","italy","united kingdom","england","ireland","united states","usa","canada","india","australia"];
// Country names in the feed languages, including countries absent from the old list.
const FOREIGN_COUNTRY_NAMES = (() => {
  const names=new Set<string>(OTHER_COUNTRIES);
  const displays=[new Intl.DisplayNames(["en"],{type:"region"}),new Intl.DisplayNames(["da"],{type:"region"})];
  for(let a=65;a<=90;a++) for(let b=65;b<=90;b++){
    const code=String.fromCharCode(a,b);
    if(code==="DK") continue;
    for(const display of displays){
      const name=display.of(code);
      if(name && name!==code) names.add(name.toLowerCase());
    }
  }
  return [...names];
})();

// This server policy is mandatory; request.country is never trusted as evidence.
function inDenmark(location:unknown, country?:unknown):boolean {
  const v=String(location||"").normalize("NFC").trim().toLowerCase();
  const explicit=String(country||"").trim().toLowerCase();
  if(explicit && !["dk","dnk","denmark","danmark"].includes(explicit)) return false;
  if(!v) return !!explicit;
  const has=(term:string)=>new RegExp("(^|[^\\p{L}])"+term+"(?=$|[^\\p{L}])","iu").test(v);
  // Explicit foreign countries take precedence over a matching city or region.
  const foreign=FOREIGN_COUNTRY_NAMES;
  const trailingCode=v.match(/(?:^|[,;·/])\s*([a-z]{2,3})\s*$/u)?.[1];
  if(trailingCode && !["dk","dnk"].includes(trailingCode)) return false;
  return !foreign.some(has) && (!!explicit || [...DK_CITIES,"dk","dnk"].some(has));
}

function cleanLocation(raw:any){
  if(!Array.isArray(raw)) return "";
  const values:string[]=[];
  for(const loc of raw){
    const city=String(loc?.city||"").trim();
    const state=String(loc?.state||"").trim();
    const country=String(loc?.country||"").trim();
    const v=[city,state,country].filter(Boolean).join(", ");
    if(v && !values.includes(v)) values.push(v);
  }
  return values.join(" / ");
}


function atsKind(url:string){
  try{
    const u=new URL(url);
    const h=u.hostname.toLowerCase();
    if(isCsod(url)) return "csod";
    if(/(^|\.)teamtailor\.com$/.test(h)) return "teamtailor";
    if(["boards.greenhouse.io","job-boards.greenhouse.io","job-boards.eu.greenhouse.io","boards-api.greenhouse.io"].includes(h)) return "greenhouse";
    if(["jobs.lever.co","jobs.eu.lever.co","api.lever.co","api.eu.lever.co"].includes(h)) return "lever";
    if(h.endsWith(".myworkdayjobs.com")) return "workday";
    if(["careers.smartrecruiters.com","jobs.smartrecruiters.com","api.smartrecruiters.com"].includes(h)) return "smartrecruiters";
    if(/^[a-z0-9][a-z0-9-]*\.recruitee\.com$/.test(h)) return "recruitee";
    if(/^[a-z0-9][a-z0-9-]*\.bamboohr\.com$/.test(h)) return "bamboohr";
    if(["jobs.ashbyhq.com","api.ashbyhq.com"].includes(h)) return "ashby";
    if(h==="apply.workable.com") return "workable";
    return "";
  }catch{return ""}
}

function extractUrlsFromHtml(html:string, base:string){
  const out:string[]=[];
  const re=/(?:href|src)=["']([^"'#]+)["']/gi;
  let m;
  while((m=re.exec(html)) && out.length<500){
    try{
      const u=new URL(m[1],base).href;
      if(/^https:/i.test(u)) out.push(u);
    }catch{}
  }
  return [...new Set(out)];
}

async function looksLikeTeamtailorBranded(url:string){
  try{
    const u=new URL(url);
    const feed=u.origin+"/jobs.rss";
    const r=await fetchText(feed,9000);
    if(!r.ok) return false;
    const t=r.text.slice(0,3000).toLowerCase();
    return t.includes("<rss") && t.includes("<item") && (t.includes("teamtailor") || t.includes("tt:"));
  }catch{return false}
}

async function discoverAtsUrl(source:any, configuredUrl:string){
  if(configuredUrl && atsKind(configuredUrl)) return configuredUrl;

  if(configuredUrl){
    const home=await fetchText(configuredUrl,12000);
    if(home.ok){
      for(const u of extractUrlsFromHtml(home.text,home.url||configuredUrl)){
        if(atsKind(u)) return u;
      }
      // Teamtailor often runs behind a custom careers domain, so no teamtailor.com link appears in HTML.
      if(await looksLikeTeamtailorBranded(home.url||configuredUrl)) return home.url||configuredUrl;
    }
  }

  const query='"'+String(source.name||"").replace(/"/g,"")+'" (jobs OR careers OR karriere OR ledige stillinger)';
  const results=(await webSearch(query)).slice(0,12);

  for(const r of results){
    if(atsKind(r.url)) return r.url;
  }

  // Search results often point to a branded careers page which embeds or fronts the ATS.
  for(const r of results.slice(0,6)){
    const pg=await fetchText(r.url,9000);
    if(!pg.ok) continue;
    for(const u of extractUrlsFromHtml(pg.text,pg.url||r.url)){
      if(atsKind(u)) return u;
    }
    if(await looksLikeTeamtailorBranded(pg.url||r.url)) return pg.url||r.url;
  }

  return "";
}

function apiChecked(source:any, jobs:any[], terms:string[], provider:string){
  const checked:any[]=[];
  for(const j of jobs){
    const title=strip(String(j.title||""));
    const description=strip(String(j.description||""));
    if(!title || !j.url) continue;
    if(excludedPosition(title,description)) continue;
    if(!roleRelevant(title,description,terms)) continue;
    checked.push({
      title,url:String(j.url),verified:true,
      reason:"current vacancy returned by "+provider+" public jobs feed/API",
      score:matchScore(title+" "+description+" "+String(j.location||""),title),
      snippet:(description||title).slice(0,1800),
      location:j.location||null,country:j.country||j.country_code||null,
      publishedAt:j.postedAt||null,
      provider
    });
  }
  return {source,checked,checkedAt:new Date().toISOString(),searchOk:true,provider};
}

function xmlTag(block:string, tag:string){
  const re=new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/"+tag+">","i");
  const m=block.match(re);
  if(!m) return "";
  const c=m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return strip(c?c[1]:m[1]);
}

async function scanTeamtailor(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const feed=u.origin+"/jobs.rss";
    const r=await fetchText(feed,15000);
    if(!r.ok) throw new Error("Teamtailor RSS HTTP "+r.status);
    const blocks=r.text.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
    const jobs=blocks.map(item=>{
      const title=xmlTag(item,"title");
      const link=xmlTag(item,"link");
      const city=xmlTag(item,"tt:city");
      const country=xmlTag(item,"tt:country");
      const pub=xmlTag(item,"pubDate");
      const remote=xmlTag(item,"remoteStatus");
      return {title,url:link,country,location:[city,country,/fully|temporary/i.test(remote)?"Remote":""].filter(Boolean).join(", "),postedAt:pub?Date.parse(pub):null};
    }).filter(j=>j.title&&j.url);
    return apiChecked(source,jobs,terms,"teamtailor");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"teamtailor",error:String(e)}}
}

async function scanGreenhouse(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    let slug="";
    const parts=u.pathname.split("/").filter(Boolean);
    if(u.hostname==="boards-api.greenhouse.io"){
      const i=parts.indexOf("boards"); if(i>=0) slug=parts[i+1]||"";
    }else slug=parts[0]||"";
    if(!slug) throw new Error("Greenhouse board slug not found");
    const api="https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(slug)+"/jobs?content=true";
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},15000);
    if(!r.ok) throw new Error("Greenhouse HTTP "+r.status);
    const json=await r.json();
    const jobs=(Array.isArray(json?.jobs)?json.jobs:[]).map((j:any)=>({
      title:j.title||"",url:j.absolute_url||"",location:j.location?.name||"",
      description:strip(String(j.content||"")),postedAt:j.updated_at?Date.parse(j.updated_at):null
    }));
    return apiChecked(source,jobs,terms,"greenhouse");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"greenhouse",error:String(e)}}
}

async function scanLever(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const parts=u.pathname.split("/").filter(Boolean);
    let slug="";
    let eu=false;
    if(u.hostname==="api.lever.co"||u.hostname==="api.eu.lever.co"){
      const i=parts.indexOf("postings"); slug=i>=0?(parts[i+1]||""):""; eu=u.hostname.includes(".eu.");
    }else{
      slug=parts[0]||""; eu=u.hostname==="jobs.eu.lever.co";
    }
    if(!slug) throw new Error("Lever board slug not found");
    const api="https://api."+(eu?"eu.":"")+"lever.co/v0/postings/"+encodeURIComponent(slug);
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},15000);
    if(!r.ok) throw new Error("Lever HTTP "+r.status);
    const json=await r.json();
    const jobs=(Array.isArray(json)?json:[]).map((j:any)=>({
      title:j.text||"",url:j.hostedUrl||"",location:[j.categories?.location,...(Array.isArray(j.categories?.allLocations)?j.categories.allLocations:[])].filter(Boolean).join("; "),
      description:j.descriptionPlain||"",postedAt:typeof j.createdAt==="number"?j.createdAt:null
    }));
    return apiChecked(source,jobs,terms,"lever");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"lever",error:String(e)}}
}

function resolveWorkday(url:string){
  const m=url.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if(!m) return null;
  const [,tenant,instance,site]=m;
  const origin="https://"+tenant+"."+instance+".myworkdayjobs.com";
  return {origin,tenant,site,api:origin+"/wday/cxs/"+tenant+"/"+site+"/jobs",jobBase:origin+"/"+site};
}
async function scanWorkday(source:any,url:string,terms:string[]){
  try{
    const ep=resolveWorkday(url);
    if(!ep) throw new Error("Workday endpoint not recognized");
    const jobs:any[]=[];
    const limit=20;
    let total=Infinity;
    for(let offset=0;offset<total && offset<2000;offset+=limit){
      const r=await fetchResponse(ep.api,{
        method:"POST",redirect:"error",
        headers:{"content-type":"application/json",accept:"application/json","accept-language":"en-US,en;q=0.9",origin:ep.origin,referer:ep.jobBase+"/"},
        body:JSON.stringify({limit,offset,searchText:"",appliedFacets:{}})
      },18000);
      if(!r.ok) throw new Error("Workday HTTP "+r.status);
      const json=await r.json();
      total=typeof json?.total==="number"?json.total:offset+(json?.jobPostings?.length||0);
      const rows=Array.isArray(json?.jobPostings)?json.jobPostings:[];
      for(const j of rows){
        if(!j?.externalPath||!j?.title) continue;
        jobs.push({title:j.title,url:ep.jobBase+j.externalPath,location:j.locationsText||"",postedAt:null});
      }
      if(rows.length<limit) break;
      await new Promise(r=>setTimeout(r,180));
    }
    return apiChecked(source,jobs,terms,"workday");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"workday",error:String(e)}}
}

async function scanSmartRecruiters(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const parts=u.pathname.split("/").filter(Boolean);
    let slug="";
    if(u.hostname==="api.smartrecruiters.com"){
      const i=parts.indexOf("companies"); slug=i>=0?(parts[i+1]||""):"";
    } else slug=parts[0]||"";
    if(!slug) throw new Error("SmartRecruiters company slug not found");
    const jobs:any[]=[];
    for(let offset=0;offset<5000;offset+=100){
      const api="https://api.smartrecruiters.com/v1/companies/"+encodeURIComponent(slug)+"/postings?limit=100&offset="+offset+"&status=PUBLIC";
      const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},15000);
      if(!r.ok) throw new Error("SmartRecruiters HTTP "+r.status);
      const json=await r.json();
      const rows=Array.isArray(json?.content)?json.content:[];
      for(const j of rows){
        const loc=j.location||{};
        const location=loc.fullLocation||[loc.city,loc.region,loc.country,loc.remote?"Remote":""].filter(Boolean).join(", ");
        const slugTitle=String(j.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
        const jobUrl="https://jobs.smartrecruiters.com/"+slug+"/"+j.id+(slugTitle?"-"+slugTitle:"");
        jobs.push({title:j.name||"",url:jobUrl,location,country:loc.country});
      }
      if(rows.length<100) break;
    }
    return apiChecked(source,jobs,terms,"smartrecruiters");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"smartrecruiters",error:String(e)}}
}

async function scanRecruitee(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const api=u.origin+"/api/offers/";
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},15000);
    if(!r.ok) throw new Error("Recruitee HTTP "+r.status);
    const json=await r.json();
    const jobs=(Array.isArray(json?.offers)?json.offers:[]).map((j:any)=>({
      title:j.title||"",url:j.careers_url||j.url||"",country:j.country,location:j.location||[j.city,j.country,j.remote?"Remote":""].filter(Boolean).join(", "),
      description:strip(String(j.description||""))
    }));
    return apiChecked(source,jobs,terms,"recruitee");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"recruitee",error:String(e)}}
}

async function scanBambooHR(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const api=u.origin+"/careers/list";
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},15000);
    if(!r.ok) throw new Error("BambooHR HTTP "+r.status);
    const json=await r.json();
    const rows=Array.isArray(json?.result)?json.result:[];
    const jobs=rows.map((j:any)=>({
      title:j.jobOpeningName||"",url:u.origin+"/careers/"+encodeURIComponent(String(j.id||"")),
      location:[j.location?.city,j.location?.state,j.isRemote?"Remote":""].filter(Boolean).join(", ")
    }));
    return apiChecked(source,jobs,terms,"bamboohr");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"bamboohr",error:String(e)}}
}

async function scanAshby(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    let slug="";
    const parts=u.pathname.split("/").filter(Boolean);
    if(u.hostname==="api.ashbyhq.com"){
      const i=parts.indexOf("job-board"); slug=i>=0?(parts[i+1]||""):"";
    }else slug=parts[0]||"";
    if(!slug) throw new Error("Ashby board slug not found");
    const api="https://api.ashbyhq.com/posting-api/job-board/"+encodeURIComponent(slug);
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json"}},30000);
    if(!r.ok) throw new Error("Ashby HTTP "+r.status);
    const json=await r.json();
    const jobs=(Array.isArray(json?.jobs)?json.jobs:[]).map((j:any)=>({
      title:j.title||"",url:j.jobUrl||"",location:[j.location,j.workplaceType==="Remote"?"Remote":""].filter(Boolean).join(" · "),
      description:j.descriptionPlain||"",postedAt:j.publishedAt?Date.parse(j.publishedAt):null
    }));
    return apiChecked(source,jobs,terms,"ashby");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"ashby",error:String(e)}}
}

async function scanWorkable(source:any,url:string,terms:string[]){
  try{
    const u=new URL(url);
    const slug=u.pathname.split("/").filter(Boolean)[0]||"";
    if(!slug) throw new Error("Workable account slug not found");
    const api="https://apply.workable.com/api/v1/widget/accounts/"+encodeURIComponent(slug)+"?details=true";
    const r=await fetchResponse(api,{redirect:"error",headers:{accept:"application/json",origin:"https://apply.workable.com"}},18000);
    if(!r.ok) throw new Error("Workable HTTP "+r.status);
    const json=await r.json();
    const jobs=(Array.isArray(json?.jobs)?json.jobs:[]).map((j:any)=>({
      title:j.title||"",url:j.shortlink||j.url||"",country:j.country,location:[j.city,j.state,j.country,j.telecommuting?"Remote":""].filter(Boolean).join(", "),
      description:strip(String(j.description||"")),postedAt:j.published_on?Date.parse(j.published_on):null
    }));
    return apiChecked(source,jobs,terms,"workable");
  }catch(e){return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"workable",error:String(e)}}
}

async function scanAts(source:any,url:string,terms:string[]){
  let kind=atsKind(url);
  if(!kind && await looksLikeTeamtailorBranded(url)) kind="teamtailor";
  if(kind==="csod") return scanCsod(source,url,terms);
  if(kind==="teamtailor") return scanTeamtailor(source,url,terms);
  if(kind==="greenhouse") return scanGreenhouse(source,url,terms);
  if(kind==="lever") return scanLever(source,url,terms);
  if(kind==="workday") return scanWorkday(source,url,terms);
  if(kind==="smartrecruiters") return scanSmartRecruiters(source,url,terms);
  if(kind==="recruitee") return scanRecruitee(source,url,terms);
  if(kind==="bamboohr") return scanBambooHR(source,url,terms);
  if(kind==="ashby") return scanAshby(source,url,terms);
  if(kind==="workable") return scanWorkable(source,url,terms);
  return null;
}

async function scanCsod(source:any, url:string, terms:string[]){
  const cfg=resolveCsod(url);
  if(!cfg) return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"csod",error:"invalid CSOD careers URL"};
  try{
    const home=await fetchResponse(cfg.homeUrl,{redirect:"error",headers:{accept:"text/html"}},12000);
    const html=await home.text();
    const token=(html.match(/"token"\s*:\s*"([A-Za-z0-9._-]+)"/)||[])[1]||"";
    if(!token) throw new Error("CSOD anonymous token not found");
    const cookie=cookieHeader(home);
    const checked:any[]=[];
    const seen=new Set<string>();
    const pageSize=25;
    for(let page=1;page<=40;page++){
      const r=await fetchResponse(cfg.searchApi,{
        method:"POST",redirect:"error",
        headers:{
          "content-type":"application/json","accept":"application/json",
          "authorization":`Bearer ${token}`,...(cookie?{"cookie":cookie}:{})
        },
        body:JSON.stringify({
          careerSiteId:cfg.siteId,careerSitePageId:cfg.siteId,pageNumber:page,pageSize,
          cultureId:1,cultureName:"en-US",searchText:"",
          states:[],countryCodes:[],cities:[],placeID:"",radius:null,postingsWithinDays:null,
          customFieldCheckboxKeys:[],customFieldDropdowns:[],customFieldRadios:[]
        })
      },15000);
      if(!r.ok) throw new Error(`CSOD search HTTP ${r.status}`);
      const json=await r.json();
      const rows=Array.isArray(json?.data?.requisitions)?json.data.requisitions:[];
      if(!rows.length) break;
      let fresh=0;
      for(const row of rows){
        const id=String(row?.requisitionId||"");
        const title=strip(String(row?.displayJobTitle||""));
        if(!id || !title || seen.has(id)) continue;
        seen.add(id); fresh++;
        if(excludedPosition(title)) continue;
        if(!roleRelevant(title,"",terms)) continue;
        const jobUrl=`${cfg.origin}/ux/ats/careersite/${cfg.siteId}/home/requisition/${encodeURIComponent(id)}?c=${encodeURIComponent(cfg.corpName)}`;
        const location=cleanLocation(row?.locations);
        const posted=String(row?.postingEffectiveDate||"").trim();
        checked.push({
          title,url:jobUrl,verified:true,reason:"current vacancy returned by employer CSOD API",
          score:matchScore(title+" "+location,title),snippet:title,location,
          publishedRaw:posted,provider:"csod"
        });
      }
      const total=Number(json?.data?.totalCount||0);
      if(fresh===0 || rows.length<pageSize || (total && page*pageSize>=total)) break;
      await new Promise(r=>setTimeout(r,120));
    }
    return {source,checked,checkedAt:new Date().toISOString(),searchOk:true,provider:"csod"};
  }catch(e){
    return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"csod",error:String(e)};
  }
}

async function scanGeneric(source:any, url:string, terms:string[]){
  const now=new Date().toISOString();
  const candidates=new Map<string,{title:string,url:string,origin:string}>();
  const home=await fetchText(url,12000);

  if(home.ok){
    for(const a of extractAnchors(home.text,home.url||url)){
      if(!jobLinkLikely(a.title,a.url)) continue;
      if(excludedPosition(a.title)) continue;
      if(genericListing(a.title,a.url)) continue;
      const sameHost=hostOf(a.url)===hostOf(home.url||url);
      const ats=ATS_HOST_HINTS.some(h=>hostOf(a.url).endsWith(h));
      if((sameHost||ats) && (roleRelevant(a.title,a.url,terms)||JOB_WORDS.some(w=>(a.title+" "+a.url).toLowerCase().includes(w)))){
        candidates.set(a.url,{...a,origin:"direct"});
      }
    }
  }

  let host=hostOf((home && home.ok && home.url) ? home.url : url);
  if(host){
    const roleQuery=terms.slice(0,10).map(x=>'"'+x.replace(/"/g,"")+'"').join(" OR ");
    const q='site:'+host+' ('+roleQuery+')';
    const sr=await fetchText("https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),11000);
    if(sr.ok){
      for(const x of extractSearchResults(sr.text)){
        if(excludedPosition(x.title)) continue;
        if(genericListing(x.title,x.url)) continue;
        if(roleRelevant(x.title,x.url,terms)||jobLinkLikely(x.title,x.url)) candidates.set(x.url,{...x,origin:"search"});
      }
    }
  }

  const checked:any[]=[];
  for(const c of [...candidates.values()].slice(0,8)){
    const pg=await fetchText(c.url,10000);
    if(!pg.ok){checked.push({...c,verified:false,reason:"page fetch failed"});continue}
    const txt=norm(pg.text);
    const closed=CLOSED_WORDS.some(x=>txt.includes(x));
    const excluded=excludedPosition(c.title,txt);
    const generic=genericListing(c.title,pg.url||c.url);
    const structuredJob=/"@type"\s*:\s*"JobPosting"/i.test(pg.text);
    const detailSignal=structuredJob || /apply now|apply for this job|ansøg nu|søg jobbet|job description|job details|requisition|stillingens indhold/i.test(txt);
    const role=roleRelevant(c.title,txt,terms);
    const verified=!closed && !excluded && !generic && detailSignal && role;
    checked.push({
      ...c,url:pg.url||c.url,verified,
      reason:verified?"specific live job advert with application/job-posting signal":closed?"closed/expired wording":excluded?"internship/student/trainee position excluded":generic?"generic career/listing page excluded":"insufficient specific job evidence",
      score:verified?matchScore(txt,c.title):null,
      snippet:strip(pg.text).slice(0,1400)
    });
  }
  return {source,checked,checkedAt:now,searchOk:home.ok || checked.length>0,provider:"generic",error:home.ok?null:(home.error||("HTTP "+home.status))};
}


function parseDanishDate(text:string){
  const m=String(text||"").match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if(!m) return null;
  const d=new Date(Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]),21,59,59));
  return Number.isNaN(d.getTime())?null:d.toISOString();
}

function extractLabeledValue(text:string,label:string){
  const re=new RegExp(label+"\\s*:?\\s*([^\\n|]{1,180})","i");
  const m=String(text||"").match(re);
  return m?m[1].trim():"";
}

async function scanArkitektforeningen(source:any,terms:string[]){
  const board="https://arkitektforeningen.dk/jobbors/";
  try{
    const page=await fetchText(board,15000);
    if(!page.ok) throw new Error("Arkitektforeningen HTTP "+page.status);
    const anchors=extractAnchors(page.text,page.url||board)
      .filter(a=>/arkitektforeningen\.dk\/job\//i.test(a.url))
      .filter(a=>!genericListing(a.title,a.url));
    const uniq=[...new Map(anchors.map(a=>[a.url,a])).values()]
      .filter((a:any)=>roleRelevant(a.title||"",a.url||"",terms))
      .slice(0,20);
    const checked:any[]=[];
    for(let i=0;i<uniq.length;i+=5){
      const batch=uniq.slice(i,i+5);
      const rows=await Promise.all(batch.map(async a=>{
        const pg=await fetchText(a.url,12000);
        if(!pg.ok) return null;
        const txt=strip(pg.text);
        const h1=(pg.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1];
        const title=strip(h1||a.title||"");
        if(!title || excludedPosition(title,txt)) return null;
        if(!roleRelevant(title,txt,terms)) return null;
        const company=extractLabeledValue(txt,"Virksomhed");
        const location=extractLabeledValue(txt,"Arbejdssted");
        const deadlineRaw=extractLabeledValue(txt,"Ansøgningsfrist");
        const deadline=parseDanishDate(deadlineRaw);
        const expired=deadline?new Date(deadline).getTime()<Date.now():false;
        const closed=CLOSED_WORDS.some(x=>txt.toLowerCase().includes(x));
        if(expired||closed) return null;
        return {
          title,url:a.url,verified:true,
          reason:"specific current Arkitektforeningen job advert",
          score:matchScore(txt,title),snippet:txt.slice(0,1800),location:location||null,
          companyOverride:company||null,deadline,provider:"arkitektforeningen"
        };
      }));
      for(const r of rows) if(r) checked.push(r);
    }
    return {source,checked,checkedAt:new Date().toISOString(),searchOk:true,provider:"arkitektforeningen"};
  }catch(e){
    return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"arkitektforeningen",error:String(e)};
  }
}

function looksSpecificPortalUrl(url:string){
  try{
    const u=new URL(url);
    const p=u.pathname.toLowerCase().replace(/\/+$/,"");
    if(!p || ["/job","/jobs","/find-job","/jobsoegning","/ledige-job","/ledige-stillinger"].includes(p)) return false;
    if(/\/(job|jobs|stilling|stillinger|vacancy|position)\//.test(p)) return true;
    if(/[?&](jobid|id|job|positionid|vacancyid)=/i.test(u.search)) return true;
    if(/\/[a-f0-9-]{16,}$/i.test(p) || /\/[0-9]{5,}$/i.test(p)) return true;
    return p.split("/").filter(Boolean).length>=2;
  }catch{return false}
}

async function scanPortalByQueries(source:any,baseUrl:string,queryHost:string,terms:string[],provider:string){
  try{
    const candidates=new Map<string,{title:string,url:string}>();
    const preferred=terms.filter(x=>x.length>=4).slice(0,12);

    // Direct portal search pages.
    for(const role of preferred.slice(0,3)){
      let searchUrl="";
      if(provider==="jobnet") searchUrl="https://jobnet.dk/find-job?searchString="+encodeURIComponent(role);
      if(provider==="jobindex") searchUrl="https://www.jobindex.dk/jobsoegning?q="+encodeURIComponent(role);
      if(searchUrl){
        const pg=await fetchText(searchUrl,12000);
        if(pg.ok){
          for(const a of extractAnchors(pg.text,pg.url||searchUrl)){
            if(!looksSpecificPortalUrl(a.url)) continue;
            if(hostOf(a.url).endsWith(queryHost) || ATS_HOST_HINTS.some(h=>hostOf(a.url).endsWith(h))){
              candidates.set(a.url,{title:a.title,url:a.url});
            }
          }
        }
      }
    }

    // Search-engine fallback scoped to the portal, but still only accept individual adverts.
    for(const role of preferred.slice(0,3)){
      const results=await webSearch('site:'+queryHost+' "'+role.replace(/"/g,"")+'"');
      for(const r of results){
        if(!looksSpecificPortalUrl(r.url)) continue;
        candidates.set(r.url,{title:r.title,url:r.url});
      }
    }

    const checked:any[]=[];
    const arr=[...candidates.values()].slice(0,12);
    for(let i=0;i<arr.length;i+=5){
      const batch=arr.slice(i,i+5);
      const rows=await Promise.all(batch.map(async c=>{
        const pg=await fetchText(c.url,12000);
        if(!pg.ok) return null;
        const txt=strip(pg.text);
        let title=strip((pg.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||c.title||"");
        if(!title || genericListing(title,pg.url||c.url)) return null;
        if(excludedPosition(title,txt)) return null;
        if(!roleRelevant(title,txt,terms)) return null;
        const closed=CLOSED_WORDS.some(x=>txt.toLowerCase().includes(x));
        if(closed) return null;
        const deadline=parseDanishDate(extractLabeledValue(txt,"Ansøgningsfrist")||extractLabeledValue(txt,"Søg senest")||extractLabeledValue(txt,"Deadline"));
        if(deadline && new Date(deadline).getTime()<Date.now()) return null;
        const location=extractLabeledValue(txt,"Arbejdssted")||extractLabeledValue(txt,"Lokation")||extractLabeledValue(txt,"Location");
        const company=extractLabeledValue(txt,"Virksomhed")||extractLabeledValue(txt,"Company");
        return {
          title,url:pg.url||c.url,verified:true,
          reason:"specific current "+provider+" job advert",
          score:matchScore(txt,title),snippet:txt.slice(0,1800),
          location:location||null,companyOverride:company||null,deadline,provider
        };
      }));
      for(const r of rows) if(r) checked.push(r);
    }
    return {source,checked,checkedAt:new Date().toISOString(),searchOk:true,provider};
  }catch(e){
    return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider,error:String(e)};
  }
}

async function scanJobnet(source:any,terms:string[]){
  return scanPortalByQueries(source,"https://jobnet.dk/","jobnet.dk",terms,"jobnet");
}

async function scanJobindex(source:any,terms:string[]){
  return scanPortalByQueries(source,"https://www.jobindex.dk/","jobindex.dk",terms,"jobindex");
}

async function scanSource(source:any, profile:any){
  const configured=normalizeUrl(source.domain||"",source.name||"");
  const terms=roleTerms(profile);
  const sourceName=String(source.name||"").toLowerCase();

  if(sourceName==="arkitektforeningen") return scanArkitektforeningen(source,terms);
  if(sourceName==="jobnet" || sourceName==="regional/municipal portals" || sourceName==="workindenmark") return scanJobnet(source,terms);
  if(sourceName==="jobindex") return scanJobindex(source,terms);
  if(String(source.name||"").toLowerCase()==="teamtailor"){
    return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"platform",error:"ATS platform directory is not an employer vacancy source"};
  }

  if(configured && atsKind(configured)){
    const direct=await scanAts(source,configured,terms);
    if(direct){ direct.atsUrl=configured; return direct; }
  }

  const discoveredAts=await discoverAtsUrl(source,configured);
  if(discoveredAts){
    const atsResult=await scanAts(source,discoveredAts,terms);
    if(atsResult && atsResult.searchOk){ atsResult.atsUrl=discoveredAts; return atsResult; }
  }

  if(configured) return scanGeneric(source,configured,terms);

  // Placeholder sources: fall back to the best careers/jobs result rather than a fake target: URL.
  const q='"'+String(source.name||"").replace(/"/g,"")+'" (jobs OR careers OR karriere OR ledige stillinger)';
  const results=await webSearch(q);
  if(results.length){
    const first=results.find((x:any)=>jobLinkLikely(x.title,x.url)) || results[0];
    if(first?.url){
      if(await looksLikeTeamtailorBranded(first.url)){
        const tt=await scanTeamtailor(source,first.url,terms);
        if(tt.searchOk){tt.atsUrl=first.url;return tt}
      }
      return scanGeneric(source,first.url,terms);
    }
  }
  return {source,checked:[],checkedAt:new Date().toISOString(),searchOk:false,provider:"discovery",error:"No careers or ATS endpoint discovered"};
}

function parseCsodDate(raw:string){
  const m=(raw||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m) return null;
  const d=new Date(Date.UTC(Number(m[3]),Number(m[1])-1,Number(m[2])));
  return Number.isNaN(d.getTime())?null:d.toISOString();
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    if(req.method!=="POST") return new Response(JSON.stringify({error:"method not allowed"}),{status:405,headers:cors});
    const auth=req.headers.get("Authorization")||"";
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userErr}=await userClient.auth.getUser();
    if(userErr||!user) return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:cors});
    const admin=createClient(url,service);

    const body=await req.json().catch(()=>({}));
    const offset=Math.max(0,Number(body.offset||0));
    const limit=Math.min(3,Math.max(1,Number(body.limit||2)));
    const requestId=body.scan_request_id||null;
    let runId=body.run_id||null;

    // Admin queries bypass RLS: validate every supplied identifier before writing.
    let scanRequest:any=null;
    if(requestId){
      const lookup=await admin.from("job_scan_requests").select("*").eq("id",requestId).eq("user_id",user.id).maybeSingle();
      if(lookup.error) throw lookup.error;
      scanRequest=lookup.data;
      if(!scanRequest) return new Response(JSON.stringify({error:"scan request not found"}),{status:404,headers:cors});
      if(scanRequest.result_run_id){
        if(runId && runId!==scanRequest.result_run_id) return new Response(JSON.stringify({error:"run does not belong to request"}),{status:409,headers:cors});
        runId=scanRequest.result_run_id;
      }
    }
    if(runId){
      const lookup=await admin.from("job_scan_runs").select("id").eq("id",runId).eq("user_id",user.id).maybeSingle();
      if(lookup.error) throw lookup.error;
      if(!lookup.data) return new Response(JSON.stringify({error:"scan run not found"}),{status:404,headers:cors});
    }
    if(!Number.isInteger(offset)||!Number.isInteger(limit)) return new Response(JSON.stringify({error:"invalid batch bounds"}),{status:400,headers:cors});

    const profRes=await admin.from("career_profiles").select("preferred_roles,preferred_locations,skills,software,professional_title").eq("user_id",user.id).maybeSingle();
    if(profRes.error) throw profRes.error;
    const profile=profRes.data||{};

    if(requestId){
      const started=await admin.from("job_scan_requests").update({
        status:"running",started_at:new Date().toISOString(),
        message:"Scanning employer career pages and ATS feeds directly"
      }).eq("id",requestId).eq("user_id",user.id);
      if(started.error) throw started.error;
    }
    if(!runId){
      const ins=await admin.from("job_scan_runs").insert({
        user_id:user.id,status:"running",summary:"Direct employer/ATS scan in progress",metadata:{providers:["direct","ats","search-fallback"]}
      }).select("id").single();
      if(ins.error) throw ins.error;
      runId=ins.data.id;
    }

    if(requestId){
      const linked=await admin.from("job_scan_requests").update({result_run_id:runId}).eq("id",requestId).eq("user_id",user.id);
      if(linked.error) throw linked.error;
    }

    const countRes=await admin.from("job_sources").select("*",{count:"exact",head:true}).eq("user_id",user.id).eq("enabled",true);
    if(countRes.error) throw countRes.error;
    const total=countRes.count||0;
    const srcRes=await admin.from("job_sources").select("*").eq("user_id",user.id).eq("enabled",true).order("source_group").order("name").range(offset,offset+limit-1);
    if(srcRes.error) throw srcRes.error;
    const sources=srcRes.data||[];

    const batches:any[]=[];
    for(let i=0;i<sources.length;i+=2){
      const part=sources.slice(i,i+2);
      const results=await Promise.all(part.map((s:any)=>scanSource(s,profile)));
      batches.push(...results);
    }

    let found=0, verified=0, imported=0, rejected=0;
    const diagnostics:any[]=[];

    for(const r of batches){
      const useful=r.checked.filter((x:any)=>x.verified && inDenmark(x.location,x.country)).length;
      const bad=r.checked.length-useful;
      found+=r.checked.length; verified+=useful; rejected+=bad;
      diagnostics.push({source:r.source.name,provider:r.provider,ok:r.searchOk,found:r.checked.length,verified:useful,error:r.error||null});

      const sourceUpdate:any={
        last_checked_at:r.checkedAt,
        useful_hits:(r.source.useful_hits||0)+useful,
        rejected_hits:(r.source.rejected_hits||0)+bad
      };
      if(r.atsUrl && atsKind(r.atsUrl)) sourceUpdate.domain=r.atsUrl;
      const sourceSaved=await admin.from("job_sources").update(sourceUpdate).eq("id",r.source.id).eq("user_id",user.id);
      if(sourceSaved.error) throw sourceSaved.error;

      for(const c of r.checked){
        if(!inDenmark(c.location,c.country)) continue;
        const publishedAt=c.publishedRaw?parseCsodDate(c.publishedRaw):(typeof c.publishedAt==="number"&&Number.isFinite(c.publishedAt)?new Date(c.publishedAt).toISOString():null);
        const discoveryPayload:any={
          user_id:user.id,source_name:r.source.name,title:c.title||"Job opportunity",
          company:c.companyOverride||r.source.name,job_url:c.url,location:c.location||null,snippet:c.snippet||null,
          verified_open:!!c.verified,verified_at:new Date().toISOString(),
          verification_status:c.verified?"open":"unverified",
          verification_evidence:c.reason||null,match_score:c.score||null,
          rejected_reason:c.verified?null:(c.reason||"not verified")
        };
        if(publishedAt) discoveryPayload.published_at=publishedAt;
        if(c.deadline) discoveryPayload.deadline=c.deadline;
        const di=await admin.from("job_discoveries").upsert(discoveryPayload,{onConflict:"user_id,job_url"});
        if(di.error) throw di.error;

        if(c.verified){
          const existing=await admin.from("jobs").select("id,status").eq("user_id",user.id).eq("job_url",c.url).maybeSingle();
          if(existing.error) throw existing.error;
          const payload:any={
            user_id:user.id,title:c.title||"Job opportunity",company:c.companyOverride||r.source.name,
            job_url:c.url,source_name:r.source.name,
            match_score:c.score||null,verified_open:true,verified_at:new Date().toISOString(),
            verification_status:"open",verification_evidence:c.reason,
            description:c.snippet||null,location:c.location||null,updated_at:new Date().toISOString()
          };
          if(publishedAt) payload.published_at=publishedAt;
          if(c.deadline) payload.deadline=c.deadline;
          if(existing.data?.id){
            // Refresh vacancy facts without resetting any user-selected tracking stage.
            const updated=await admin.from("jobs").update(payload).eq("id",existing.data.id).eq("user_id",user.id);
            if(updated.error) throw updated.error;
          }else{
            payload.status="discovered";
            const ir=await admin.from("jobs").insert(payload);
            if(ir.error) throw ir.error;
            imported++;
          }
        }
      }
    }

    const successfulSources=batches.filter((x:any)=>x.searchOk).length;
    const failedSources=batches.length-successfulSources;
    const next=offset+sources.length;
    const done=next>=total;
    const currentRun=await admin.from("job_scan_runs").select("*").eq("id",runId).single();
    if(currentRun.error) throw currentRun.error;
    const prev=currentRun.data||{};
    const prevDiag=Array.isArray(prev.metadata?.diagnostics)?prev.metadata.diagnostics:[];
    const totals={
      sources_checked:(prev.sources_checked||0)+successfulSources,
      vacancies_found:(prev.vacancies_found||0)+found,
      verified_open:(prev.verified_open||0)+verified,
      imported_count:(prev.imported_count||0)+imported,
      rejected_count:(prev.rejected_count||0)+rejected
    };
    const saved=await admin.from("job_scan_runs").update({
      ...totals,status:done?"completed":"running",
      completed_at:done?new Date().toISOString():null,
      summary:done?"Direct employer/ATS scan completed across enabled source registry":"Direct employer/ATS scan in progress",
      metadata:{
        ...(prev.metadata||{}),
        diagnostics:[...prevDiag,...diagnostics],
        processed_sources:Number(prev.metadata?.processed_sources||0)+sources.length,
        failed_sources:Number(prev.metadata?.failed_sources||0)+failedSources
      }
    }).eq("id",runId).eq("user_id",user.id);
    if(saved.error) throw saved.error;

    if(done&&requestId){
      const completed=await admin.from("job_scan_requests").update({
        status:"completed",completed_at:new Date().toISOString(),
        message:"Direct employer and ATS scan completed",result_run_id:runId
      }).eq("id",requestId).eq("user_id",user.id);
      if(completed.error) throw completed.error;
    }

    return new Response(JSON.stringify({
      ok:true,run_id:runId,request_id:requestId,offset,next_offset:next,total,
      processed:sources.length,successful_sources:successfulSources,failed_sources:failedSources,found,verified,imported,rejected,done,diagnostics
    }),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({error:String(e)}),{status:500,headers:cors});
  }
});

