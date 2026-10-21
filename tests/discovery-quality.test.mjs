import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDuck,roleRelevant,scanSource} from '../supabase/functions/_shared/scan-core.ts';
import {prepareSourceResult} from '../supabase/functions/_shared/batch.ts';
import {classifyVacancy,verifySavedJob} from '../supabase/functions/_shared/verification.ts';
const now=Date.parse('2026-10-21T12:00:00Z');
const job={title:'BIM Coordinator',job_url:'https://employer.test/jobs/bim',published_at:'2026-08-01'};
const advert='<h1>BIM Coordinator</h1><p>Apply now</p>';
test('search redirects resolve to canonical employer URL without double decoding',()=>{
 const target='https://employer.test/jobs/BIM?id=A%2FB&lang=da';
 const packed=Buffer.from(target).toString('base64url');
 assert.equal(decodeDuck('https://www.bing.com/ck/a?!&amp;u=a1'+packed+'&amp;ntb=1'),target);
 assert.equal(decodeDuck('//duckduckgo.com/l/?uddg='+encodeURIComponent(target)),target);
 assert.equal(decodeDuck('https://bing.com/ck/a?u=broken'),'');
 assert.equal(decodeDuck('javascript:alert(1)'),'');
});
test('unrelated vacancy cannot qualify via project words in body or footer',()=>{
 assert.equal(roleRelevant('Sygeplejerske til medicinsk afdeling','project manager BIM coordinator', ['bim','project manager']),false);
 assert.equal(roleRelevant('Konfliktmægler','',['ikt']),false);
 assert.equal(roleRelevant('BIM Coordinator','',['BIM']),true);
 assert.equal(roleRelevant('Projektleder med erfaring i byggeri','',['projektleder']),true);
});
test('unrelated search results are a source failure and are never fetched as adverts',async t=>{
 const urls=[];t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));return new Response('<a class="result__a" href="https://journal.test/article">Migraine research in Sweden</a>');});
 const result=await scanSource({id:'fixture',name:'Search',domain:'discovery:dk:BIM%20Coordinator'},{preferred_roles:['BIM Coordinator']});
 assert.equal(result.searchOk,false);assert.match(result.error,/unrelated/);assert.equal(result.checked.length,0);assert.equal(urls.some(x=>x.includes('journal.test')),false);
});
test('rejection diagnostics explain candidates discarded before persistence',()=>{
 const r=prepareSourceResult({source:{id:'s',name:'fixture'},searchOk:true,checked:[{title:'BIM',url:'https://example.test/job',verified:true},{title:'BIM',url:'https://example.test/job2',location:'Sweden',verified:true},{title:'BIM',url:'https://example.test/job3',location:'Denmark',verified:false,reason:'no application signal'}]});
 assert.equal(r.rejection_reasons.missing_workplace_evidence,1);assert.equal(r.rejection_reasons.outside_Denmark_or_conflicting_evidence,1);assert.equal(r.rejected,3);assert.equal(r.rejected_samples.length,2);
});
test('an old publication date alone does not expire an open vacancy',()=>{
 const r=classifyVacancy(job,advert,job.job_url,200,now);assert.equal(r.status,'open');assert.equal(r.conclusive,true);
});
test('closure, expired deadline and removal are conclusive',()=>{
 for(const r of [classifyVacancy(job,'<h1>BIM Coordinator</h1> No longer accepting applications',job.job_url,200,now),classifyVacancy({...job,deadline:'2026-10-20'},advert,job.job_url,200,now),classifyVacancy(job,'',job.job_url,404,now)]){assert.equal(r.conclusive,true);assert.equal(r.verified_open,false);}
});
test('provider errors, generic redirects, mismatched pages and no application signal stay inconclusive',()=>{
 for(const r of [classifyVacancy(job,'',job.job_url,403,now),classifyVacancy(job,'',job.job_url,503,now),classifyVacancy(job,advert,'https://employer.test/careers',200,now),classifyVacancy(job,'<h1>Other role</h1> Apply now',job.job_url,200,now),classifyVacancy(job,'<h1>BIM Coordinator</h1> Job description',job.job_url,200,now)]){assert.equal(r.conclusive,false);assert.equal(r.verified_at,undefined);}
});
test('verification rejects private URLs before fetching and preserves errors',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('timeout');};
 assert.equal((await verifySavedJob({...job,job_url:'http://localhost/job'},fetcher,now)).conclusive,false);assert.equal(calls,0);
 assert.equal((await verifySavedJob(job,fetcher,now)).status,'error');assert.equal(calls,1);
});
