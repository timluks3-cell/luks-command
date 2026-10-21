import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const now=Date.now(),day=86400000;
const base={title:'BIM Coordinator',company:'Example',location:'Ishøj',verified_open:true,verified_at:new Date(now).toISOString(),status:'discovered'};
const rows=[
 {...base,id:'due',deadline:new Date(now+day).toISOString()},
 {...base,id:'expired',deadline:new Date(now-day).toISOString()},
 {...base,id:'saved',status:'saved'},
 {...base,id:'applied',status:'applied',updated_at:new Date(now-9*day).toISOString()},
 {...base,id:'recent',status:'applied',updated_at:new Date(now-day).toISOString()},
 {...base,id:'foreign',location:'Sweden',deadline:new Date(now+day).toISOString()},
 {...base,id:'stale',verified_at:new Date(now-9*day).toISOString()},
 {...base,id:'interview',status:'interview'}
];
function ui(){
 const nodes=new Map();const E=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:''});return nodes.get(id)};
 const db={from(name){const q={then(resolve){return Promise.resolve({data:name==='jobs'?rows:[]}).then(resolve)}};for(const key of ['select','order','limit','eq','neq','range'])q[key]=()=>q;return q;}};
 const context=vm.createContext({db,E,rows,esc:v=>String(v??''),user:null,localMode:false,URL,Intl,Date,window:null,go:p=>{context.page=p},setTimeout:()=>0});
 context.window=context;
 vm.runInContext(readFileSync(new URL('../scanner.js',import.meta.url),'utf8').replace('if(user||localMode) render();','window.testAttention=dashboardAttention;').replace('let storedMatches=[];','let storedMatches=rows;'),context);
 context.user={id:'fixture'};return {context,E};
}
test('attention only includes verified Danish jobs and distinguishes tracking age',()=>{
 const {context}=ui(),before=JSON.stringify(rows);
 const attention=context.testAttention(rows,now);
 assert.deepEqual(Array.from(attention.due,j=>j.id),['due']);
 assert.deepEqual(Array.from(attention.saved,j=>j.id),['saved']);
 assert.deepEqual(Array.from(attention.followups,j=>j.id),['applied']);
 assert.equal(JSON.stringify(rows),before);
});
test('application progress links select the intended career stage without changing records',async()=>{
 const {context,E}=ui(),before=JSON.stringify(rows);
 context.openCareerStage('interview');assert.equal(context.page,'career');
 await context.career();assert.equal(E('careerStage').value,'interview');assert.equal(E('careerCount').textContent,'1 jobs');
 context.openCareerStage('not-a-stage');await context.career();
 assert.equal(JSON.stringify(rows),before);
});
test('view all current jobs resets an earlier show-history preference',()=>{
 const {context,E}=ui();
 context.toggleAppliedInCurrent(true);
 context.openCurrentJobs();context.refreshBestMatches();
 assert.equal(context.page,'scanner');assert.equal(E('bestMatchesCount').textContent,'2 Denmark jobs');
});
