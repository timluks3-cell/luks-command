import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {prepareSourceResult} from '../supabase/functions/_shared/batch.ts';

const now=Date.parse('2026-10-21T12:00:00Z');
const past='2026-10-20T12:00:00Z',future='2099-01-01T12:00:00Z';
const base={title:'BIM Coordinator',location:'Ishøj',company:'Example',status:'discovered',verified_open:true,verified_at:new Date().toISOString(),match_score:90};
const fixtures=[
 {...base,id:'available',title:'Available vacancy'},
 {...base,id:'deadline',title:'Past deadline vacancy',deadline:past},
 {...base,id:'expired',title:'Expired vacancy',verification_status:'expired'},
 {...base,id:'closed',title:'Closed vacancy',verification_status:'closed'},
 {...base,id:'rejected',title:'Rejected expired advert',verified_open:false,rejected_reason:'closed/expired wording or deadline'},
 {...base,id:'applied',title:'Applied expired vacancy',status:'applied',deadline:past}
];
function ui(){
 const controls=new Map();
 const E=id=>{if(!controls.has(id))controls.set(id,{innerHTML:'',textContent:'',value:''});return controls.get(id)};
 const context=vm.createContext({fixtures,E,user:null,localMode:false,URL,Intl,Date,esc:x=>String(x??''),window:null});
 context.window=context;
 const source=readFileSync(new URL('../scanner.js',import.meta.url),'utf8')
  .replace('let storedMatches=[];','let storedMatches=fixtures;')
  .replace('let careerJobs=[];','let careerJobs=fixtures;')
  .replace('if(user||localMode) render();','window.testDiscoveryTable=discoveryTable;');
 vm.runInContext(source,context);
 return {context,E};
}
test('every available-results mode excludes deadline, status and closure evidence',()=>{
 const {context,E}=ui();
 for(const mode of ['current','all']){
  E('matchStatus').value=mode;context.refreshBestMatches();
  assert.equal(E('bestMatchesCount').textContent,'1 Denmark jobs');
  assert.match(E('bestMatchesGrid').innerHTML,/Available vacancy/);
  assert.doesNotMatch(E('bestMatchesGrid').innerHTML,/Past deadline vacancy|Expired vacancy|Closed vacancy|Rejected expired advert|Applied expired vacancy/);
 }
});
test('discovery list excludes expired adverts even with a stale verified-open flag',()=>{
 const {context}=ui();const html=context.testDiscoveryTable(fixtures);
 assert.match(html,/Available vacancy/);
 assert.doesNotMatch(html,/Past deadline vacancy|Expired vacancy|Closed vacancy|Rejected expired advert|Applied expired vacancy/);
});
test('career defaults exclude expired jobs while explicit applied history preserves them',()=>{
 const before=JSON.stringify(fixtures);const {context,E}=ui();
 context.careerFilter();assert.equal(E('careerCount').textContent,'1 jobs');
 E('careerStage').value='applied';context.careerFilter();
 assert.equal(E('careerCount').textContent,'1 jobs');assert.match(E('careerResults').innerHTML,/Applied expired vacancy/);
 E('matchStatus').value='applied';context.refreshBestMatches();assert.match(E('bestMatchesGrid').innerHTML,/Applied expired vacancy/);
 assert.equal(JSON.stringify(fixtures),before);
});
test('worker rejects passed deadlines even when a provider incorrectly claims verified',()=>{
 const r=prepareSourceResult({source:{id:'s',name:'Example'},searchOk:true,checked:[
  {title:'Expired',url:'https://example.test/expired',location:'Denmark',verified:true,deadline:past},
  {title:'Future',url:'https://example.test/future',location:'Denmark',verified:true,deadline:future},
  {title:'No deadline',url:'https://example.test/open',location:'Denmark',verified:true}
 ]},now);
 assert.equal(r.candidates.filter(x=>x.verified).length,2);
 assert.equal(r.candidates[0].verified,false);assert.equal(r.candidates[0].reason,'Application deadline has passed');
 assert.equal(r.rejected,1);assert.equal(r.rejection_reasons['Application deadline has passed'],1);
});
