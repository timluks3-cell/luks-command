import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync('scanner.js','utf8'),now=Date.now(),start=new Date(now-60000).toISOString();
const job=(id,title,patch={})=>({id,title,company:'Example',location:'Copenhagen',job_url:'https://example.test/'+id,status:'discovered',match_score:90,verified_open:true,verification_status:'open',verified_at:new Date(now).toISOString(),created_at:new Date(now-30000).toISOString(),deadline:new Date(now+86400000).toISOString(),...patch});
const jobs=[job('one','New strong vacancy'),job('two','Lower match',{match_score:70}),job('three','Applied vacancy',{status:'applied'}),job('four','Expired vacancy',{deadline:'2020-01-01'}),job('five','Foreign vacancy',{location:'Sweden'}),job('old','Older vacancy',{created_at:'2020-01-01'})];
async function scanner(extra={}){
 const nodes=new Map(),E=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);};
 const tables={jobs,career_profiles:{preferred_roles:[]},job_sources:[],job_scan_requests:[],job_scan_runs:[{started_at:start,finished_at:new Date(now).toISOString(),sources_checked:1,vacancies_found:5,rejected_count:3,imported_count:2,metadata:{failed_sources:1,diagnostics:[{source:'Readable source',ok:true,found:5,rejected:3},{source:'<script>blocked</script>',ok:false,error:'Provider blocked'}]}}],job_discoveries:jobs.map(j=>({...j,imported_job_id:j.id})),...extra};
 const db={from(table){const q={then(resolve){return Promise.resolve({data:tables[table]||[]}).then(resolve);}};for(const m of ['select','order','limit','eq','neq','maybeSingle','range'])q[m]=()=>q;return q;}};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ctx=vm.createContext({URL,Intl,Date,console,db,E,esc,user:null,localMode:false,page:'scanner',window:null,document:{querySelectorAll:()=>[]},setTimeout:()=>0,clearInterval(){}});ctx.window=ctx;
 vm.runInContext(source,ctx);ctx.user={id:'owner'};await ctx.scanner();return {ctx,html:E('view').innerHTML,details:ctx.LuksScannerMetrics.details};
}
test('all seven scan-summary cards are keyboard-accessible detail buttons',async()=>{
 const {html,details}=await scanner();assert.equal((html.match(/data-scan-metric=/g)||[]).length,7);
 for(const key of ['found','strong','sources','imported','filtered','errors','current']){assert.ok(html.includes('data-scan-metric="'+key+'"'));assert.ok(details[key].title);assert.ok(details[key].html);}
 assert.match(html,/type="button".*aria-label="View Jobs Found: 5"/);
});
test('vacancy detail lists keep expired, foreign, applied and older imports out',async()=>{
 const {details}=await scanner();for(const key of ['strong','current','imported']){for(const title of ['Expired vacancy','Applied vacancy','Foreign vacancy'])assert.ok(!details[key].html.includes(title),key+': '+title);}
 assert.match(details.current.html,/Lower match/);assert.doesNotMatch(details.strong.html,/Lower match/);assert.doesNotMatch(details.imported.html,/Older vacancy/);assert.match(details.imported.html,/New strong vacancy/);assert.doesNotMatch(details.found.html,/Expired vacancy|Applied vacancy|Foreign vacancy/);
});
test('source and rejection details use recorded diagnostics and escape provider text',async()=>{
 const {details}=await scanner();assert.match(details.sources.html,/Readable source/);assert.doesNotMatch(details.sources.html,/Provider blocked/);assert.match(details.errors.html,/Provider blocked/);assert.doesNotMatch(details.errors.html,/<script>/);assert.match(details.errors.html,/&lt;script&gt;/);assert.match(details.filtered.html,/Filtered out: 3/);assert.doesNotMatch(details.filtered.html,/Expired vacancy/);
});
test('zero and missing scan details remain usable without fabricated lists',async()=>{
 const {details}=await scanner({job_scan_runs:[],job_discoveries:[]});assert.match(details.imported.html,/No new jobs/);assert.match(details.errors.html,/No source errors/);assert.match(details.found.html,/No scan has been recorded/);
 const missing=await scanner({job_scan_runs:[{started_at:start,sources_checked:10,imported_count:0,metadata:{failed_sources:4}}]});assert.match(missing.details.errors.html,/not saved/);assert.match(missing.details.sources.html,/unavailable/);assert.doesNotMatch(missing.details.imported.html,/New strong vacancy/);
});
test('account changes cannot open a prior owner metric snapshot',async()=>{const {ctx}=await scanner();ctx.user={id:'other-owner'};assert.doesNotThrow(()=>ctx.openScannerMetric('current'));});
