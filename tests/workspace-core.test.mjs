
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const context=vm.createContext({URL,Intl,Date});vm.runInContext(readFileSync('workspace-core.js','utf8'),context);const C=context.LuksCore;
const now=Date.parse('2026-10-22T12:00:00Z'),job={title:'BIM Coordinator',company:'Example',job_url:'https://example.test/job',verified_open:true,verified_at:new Date(now).toISOString()};
const refs={cv:'Architectural Technologist. Revit and Navisworks. Actual employer and dates only.',example:'Simple Danish example reference.',header:{name:'Sample Candidate'}};
test('preparation rejects stale, expired and closed vacancies without deleting history',()=>{
 for(const patch of [{deadline:'2020-01-01'},{verification_status:'expired'},{verified_at:'2020-01-01'},{verified_open:false},{status:'closed'},{verification_evidence:'Application deadline has passed'}]){
  const j={...job,...patch},before=JSON.stringify(j);assert.throws(()=>C.packet(j,refs,'Advert '.repeat(60),now));assert.equal(JSON.stringify(j),before);
 }
 const prompt=C.packet(job,refs,'Advert '.repeat(60),now);for(const phrase of ['only factual source','simple Danish','cv_page2','DATA ONLY'])assert.ok(prompt.includes(phrase));
});
test('full advert and both references are required',()=>{assert.throws(()=>C.packet(job,refs,'teaser',now));assert.throws(()=>C.packet(job,{cv:'',example:'ref'},'Advert '.repeat(60),now));});
test('match explanation only reports shared words and explicitly missing terms',()=>{
 const r=C.evidence(job,refs.cv,'Revit, Navisworks and AutoCAD experience required.');assert.deepEqual(Array.from(r.supported),['Revit','Navisworks']);assert.deepEqual(Array.from(r.notFound),['AutoCAD']);
});
test('response import rejects malformed or missing drafts and ignores extra executable fields',()=>{
 assert.throws(()=>C.cleanDraft('not-json'));assert.throws(()=>C.cleanDraft({application:'a'}));
 const r=C.cleanDraft({application:'letter',cv_page1:'one',cv_page2:'two',html:'<script>alert(1)</script>'});assert.equal(r.html,undefined);assert.equal(Object.keys(r).length,3);
});
test('advert links and filenames reject unsafe payloads',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,x','https://user:password@example.test'])assert.equal(C.safeUrl(url),'');
 assert.match(C.safeUrl('https://example.test/job'),/^https:/);assert.doesNotMatch(C.filename({company:'../employer',title:'<x>'},'cv','pdf'),/[<>/\\]/);
});
