import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {inDenmark as serverDenmark} from '../supabase/functions/_shared/scan-core.ts';
const source=readFileSync(new URL('../scanner.js',import.meta.url),'utf8');
const policy=source.slice(source.indexOf('const DK_CITIES'),source.indexOf('  let showAppliedInCurrent'));
const canonical=source.slice(source.indexOf('  function canonicalJobUrl'),source.indexOf('  window.verifyTrackedJob'));
const context=vm.createContext({URL,Intl,Date,db:null});
vm.runInContext(policy+canonical+';globalThis.api={denmarkJob,verifiedCurrent,currentUnapplied,vacancyRows,canonicalJobUrl,loadJobs};',context);
const api=context.api;
const job=(extra={})=>({id:'1',job_url:'https://example.test/jobs/ABC?id=2',location:'Ishøj',status:'discovered',verified_open:true,verified_at:new Date().toISOString(),...extra});
test('browser and server agree on country admission',()=>{
 for(const [location,country] of [['New Zealand'],['Copenhagen, Sweden'],['Ishøj'],['Hørsholm'],['Remote','DK'],['Copenhagen','SE'],['Denmark / India'],[''],['København']]){
  assert.equal(api.denmarkJob({location,country}),serverDenmark(location,country),String(location));
 }
});
test('applied duplicate suppresses new opportunities regardless of input order',()=>{
 const applied=job({id:'old',status:'applied',job_url:'https://www.example.test/jobs/ABC/?utm_source=feed&id=2'});
 const fresh=job();
 for(const rows of [[fresh,applied],[applied,fresh]]){
  const grouped=api.vacancyRows(rows);
  assert.equal(grouped.length,1); assert.equal(grouped[0].id,'old');
  assert.equal(grouped.filter(api.currentUnapplied).length,0);
  assert.equal(rows.length,2); assert.equal(applied.status,'applied');
 }
});
test('canonical identity retains distinct vacancy IDs and URL case',()=>{
 assert.equal(api.canonicalJobUrl('https://www.example.test/jobs/ABC/?b=2&a=1&utm_extra=x#top'),api.canonicalJobUrl('http://example.test/jobs/ABC?a=1&b=2'));
 assert.notEqual(api.canonicalJobUrl('https://example.test/ABC?id=A'),api.canonicalJobUrl('https://example.test/abc?id=a'));
 assert.notEqual(api.canonicalJobUrl('https://example.test/job?id=1'),api.canonicalJobUrl('https://example.test/job?id=2'));
});
test('current matches reject stale, missing, future, closed and expired verification',()=>{
 const now=Date.now();
 assert.equal(api.verifiedCurrent(job(),now),true);
 for(const extra of [{verified_at:null},{verified_at:new Date(now-8*86400000).toISOString()},{verified_at:new Date(now+86400000).toISOString()},{deadline:new Date(now-1).toISOString()},{verification_status:'closed'},{verified_open:false}]) assert.equal(api.verifiedCurrent(job(extra),now),false);
});
test('job pagination includes history beyond first page and fails explicitly',async()=>{
 const calls=[];
 context.db={from:()=>({select:()=>({order:()=>({range:async(a,b)=>{calls.push([a,b]);return {data:a===0?Array.from({length:500},(_,id)=>job({id})): [job({id:'applied',status:'applied'})]};}})})})};
 const result=await api.loadJobs(); assert.equal(result.data.length,501); assert.equal(calls.length,2);
 context.db={from:()=>({select:()=>({order:()=>({range:async()=>({error:{message:'offline'}})})})})};
 await assert.rejects(api.loadJobs(),/offline/);
});
