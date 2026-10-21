import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {jobPostingEvidence,inDenmark,excludedPosition,searchRoleHints,scanSource} from '../supabase/functions/_shared/scan-core.ts';
import {prepareSourceResult} from '../supabase/functions/_shared/batch.ts';
const posting=(extra={})=>({'@type':'JobPosting',title:'BIM Coordinator',jobLocation:{'@type':'Place',address:{addressLocality:'København',addressCountry:'DK'}},hiringOrganization:{name:'Small Danish Employer'},datePosted:'2026-10-20',validThrough:'2099-12-31',...extra});
const html=data=>'<script type="application/ld+json">'+JSON.stringify(data)+'</script><h1>BIM Coordinator</h1><p>Apply now. International projects. Mentor interns.</p>';
test('structured workplace and employer come from the advert',()=>{
 const result=jobPostingEvidence(html({'@graph':[{'@type':'Organization',address:{addressCountry:'SE'}},posting()]}));
 assert.equal(result.country,'dk');assert.match(result.location,/København/);assert.equal(result.company,'Small Danish Employer');assert.equal(inDenmark(result.location,result.country),true);
});
test('foreign and mixed vacancy locations cannot pass Danish admission',()=>{
 for(const jobLocation of [{address:{addressLocality:'Copenhagen',addressCountry:{name:'Sweden'}}},[{address:{addressCountry:'DK'}},{address:{addressCountry:'SE'}}]]){
  const evidence=jobPostingEvidence(html(posting({jobLocation})));assert.equal(inDenmark(evidence.location,evidence.country),false);
 }
});
test('malformed, multi-advert and footer-only pages supply no Denmark evidence',()=>{
 const cases=['<script type="application/ld+json">broken</script>',html([posting(),posting({title:'Other'})]),html({'@type':'Organization',address:{addressCountry:'DK'}}),html(posting({jobLocation:undefined}))];
 for(const page of cases){const evidence=jobPostingEvidence(page);assert.equal(inDenmark(evidence.location,evidence.country),false);}
 assert.equal(jobPostingEvidence(cases[1]).ambiguous,true);
});
test('title exclusions do not reject international or senior adverts mentioning students',()=>{
 for(const title of ['International BIM Coordinator','Senior Project Manager','Revit Designer']) assert.equal(excludedPosition(title,'mentor interns and students'),false);
 for(const title of ['BIM Intern','International Student Assistant','Bygningskonstruktørpraktikant','Studentermedhjælper Revit','Teknisk designer elev']) assert.equal(excludedPosition(title),true,title);
});
test('bounded search rotation eventually covers every configured title',()=>{
 const terms=Array.from({length:87},(_,i)=>'Role '+i),seen=new Set();
 for(let day=0;day<87;day++)searchRoleHints(terms,day).forEach(x=>seen.add(x));
 assert.equal(seen.size,terms.length);assert.equal(searchRoleHints(terms).length,10);assert.deepEqual(searchRoleHints([],0),[]);
});
test('generic employer scan persists Danish evidence and rejects expired adverts',async t=>{
 let expired=false;
 t.mock.method(globalThis,'fetch',async url=>new Response(String(url).includes('/jobs/bim')?html(posting({validThrough:expired?'2000-01-01':'2099-12-31'})):'<a href="https://example.test/jobs/bim">International BIM Coordinator</a>',{status:200}));
 const source={id:'fixture',name:'SME',domain:'https://example.test/careers'};
 let checked=await scanSource(source,{preferred_roles:['BIM Coordinator']});
 let result=prepareSourceResult(checked);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].country_code,'DK');assert.equal(result.candidates[0].verified,true);assert.equal(result.candidates[0].company,'Small Danish Employer');
 expired=true;result=prepareSourceResult(await scanSource(source,{}));assert.equal(result.candidates[0].verified,false);
});
test('source catalog contains distinct primary employer links',()=>{
 const entries=JSON.parse(readFileSync(new URL('../ops/danish-employer-expansion.json',import.meta.url),'utf8'));
 assert.equal(entries.length,34);assert.equal(new Set(entries.map(x=>x.name.toLowerCase())).size,34);
 for(const entry of entries)assert.match(entry.domain,/^https:\/\//);
});
test('live status distinguishes queued, running and partial scans',()=>{
 const code=readFileSync(new URL('../scanner.js',import.meta.url),'utf8');
 const part=code.slice(code.indexOf('  function missionStatus'),code.indexOf('  function metric'));
 const context=vm.createContext({});vm.runInContext(part+';globalThis.status=missionStatus;',context);
 assert.equal(context.status('pending').label,'QUEUED');assert.equal(context.status('running').label,'SCANNING');assert.equal(context.status('partial').label,'PARTIAL');
 assert.match(code,/liveState\.innerHTML=statusChip\(req\.status\)/);
});
test('role discovery finds employers outside the registry and still excludes foreign results',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{
  const value=String(url);
  if(value.includes('duckduckgo.com'))return new Response('<a class="result__a" href="https://new-sme.test/jobs/bim">BIM Coordinator</a><a class="result__a" href="https://foreign.test/jobs/bim">BIM Coordinator</a>');
  return new Response(html(posting(value.includes('foreign.test')?{jobLocation:{address:{addressCountry:'SE',addressLocality:'Stockholm'}}}:{})));
 });
 const source={id:'discovery',name:'Discovery BIM',domain:'discovery:dk:BIM%20Coordinator'};
 const result=prepareSourceResult(await scanSource(source,{preferred_roles:['BIM Coordinator']}));
 assert.equal(result.candidates.length,1);assert.match(result.candidates[0].job_url,/new-sme/);assert.equal(result.candidates[0].verified,true);
});
test('discovery rejects roles outside the saved profile before any search',async t=>{
 const spy=t.mock.method(globalThis,'fetch',()=>{throw Error('must not fetch');});
 const result=await scanSource({name:'Discovery',domain:'discovery:dk:Unrelated'}, {preferred_roles:['BIM Coordinator']});
 assert.equal(result.searchOk,false);assert.equal(spy.mock.callCount(),0);
});
