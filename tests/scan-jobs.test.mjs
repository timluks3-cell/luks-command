import test from 'node:test';
import assert from 'node:assert/strict';
import { inDenmark } from '../supabase/functions/_shared/scan-core.ts';
import { collectBatch, prepareSourceResult } from '../supabase/functions/_shared/batch.ts';

globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'publishable-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture' })[name] }, serve() {} };
const { handleRequest } = await import('../supabase/functions/scan-jobs/index.ts');
const { handleWorker } = await import('../supabase/functions/scan-worker/index.ts');
const request = (headers = {}, body = {}, method = 'POST') => new Request('https://fixture.test/functions/v1/scan-jobs', { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const token = 'fixture-token-'.repeat(4);
const mockFetch = (t, fn) => t.mock.method(globalThis, 'fetch', fn);
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const source = { id: 'source', name: 'Employer' };
const candidate = (location, country) => ({ title: 'BIM Coordinator', url: 'https://example.test/job', location, country, verified: true, score: 85 });

test('Denmark admission handles Unicode, foreign precedence, codes and unknowns', () => {
  for (const value of ['Denmark','Danmark','DK','DNK','København','Ishøj','Hørsholm','Copenhagen, Denmark']) assert.equal(inDenmark(value), true, value);
  for (const value of ['Stockholm, Sweden','Copenhagen, SE','New Zealand','Copenhagen, Rwanda','Denmark / India','Remote','NotDenmark',null,'']) assert.equal(inDenmark(value), false, String(value));
  assert.equal(inDenmark('Copenhagen', 'SE'), false);
  assert.equal(inDenmark('Copenhagen', 'unknown'), false);
  assert.equal(inDenmark('Remote', 'DK'), true);
});
test('worker admission excludes foreign and unknown candidates before persistence', () => {
  const result = prepareSourceResult({ source, searchOk: true, checked: [candidate('Ishøj'), candidate('Copenhagen','SE'), candidate('New Zealand'), candidate(null)] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].country_code, 'DK');
  const remote=prepareSourceResult({source,checked:[candidate('Remote','DK')]});
  assert.equal(remote.candidates[0].location,'Remote, Denmark');
  assert.equal(result.rejected, 3);
});
test('malformed dates and scores are normalized for atomic persistence', () => {
  const result = prepareSourceResult({ source, checked: [{ ...candidate('Denmark'), publishedAt: 'bad', deadline: 'bad', score: 999 }] });
  assert.equal(result.candidates[0].score, 100);
  assert.equal(result.candidates[0].published_at, null);
  assert.equal(result.candidates[0].deadline, null);
});
test('source exceptions are reported without losing batch order', async () => {
  const sources = [{id:'one'}, {id:'two'}];
  const result = await collectBatch(sources, {}, 100, async s => { if(s.id==='two') throw Error('blocked'); return {source:s,searchOk:true,checked:[]}; });
  assert.deepEqual(result.map(r=>r.source_id), ['one','two']);
  assert.equal(result[0].ok,true); assert.equal(result[1].ok,false);
});
test('source timeouts become explicit failed-source results', async () => {
  const result = await collectBatch([source], {}, 5, () => new Promise(()=>{}));
  assert.equal(result[0].ok,false); assert.match(result[0].error,/time budget/);
});
test('worker rejects missing token before contacting the database', async t => {
  const fetch=mockFetch(t,()=>{throw Error('must not call');});
  assert.equal((await handleWorker(request())).status,401); assert.equal(fetch.mock.callCount(),0);
});
test('worker rejects invalid Vault token', async t => {
  mockFetch(t,async()=>reply({message:'invalid worker token'},400));
  assert.equal((await handleWorker(request({'x-luks-worker-token':token}))).status,401);
});
test('worker returns idle when another invocation owns the lease', async t => {
  mockFetch(t,async()=>reply(null));
  assert.equal((await (await handleWorker(request({'x-luks-worker-token':token}))).json()).idle,true);
});
test('worker passes the fencing token to transactional persistence', async t => {
  const calls=[];
  mockFetch(t,async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return reply(calls.length===1?{work_id:'work',lease:'lease',sources:[],profile:{}}:{done:true});});
  assert.equal((await handleWorker(request({'x-luks-worker-token':token}))).status,200);
  assert.deepEqual(calls[1].body,{p_work_id:'work',p_lease:'lease',p_results:[]});
});
test('database failure releases only the claimed lease for retry', async t => {
  const calls=[];
  mockFetch(t,async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});if(calls.length===1)return reply({work_id:'work',lease:'lease',sources:[],profile:{}});if(calls.length===2)return reply({message:'write failure'},500);return reply(null);});
  assert.equal((await handleWorker(request({'x-luks-worker-token':token}))).status,500);
  assert.match(calls[2].url,/luks_fail_scan_batch$/); assert.equal(calls[2].body.p_lease,'lease');
});
test('manual endpoint rejects missing user authentication', async()=>assert.equal((await handleRequest(request())).status,401));
test('manual endpoint preserves user authorization and ignores caller country hints', async t => {
  mockFetch(t,async(url,opts)=>{assert.match(url,/luks_request_scan$/);assert.equal(opts.headers.Authorization,'Bearer user-fixture');assert.equal(opts.headers.apikey,'publishable-fixture');assert.deepEqual(JSON.parse(opts.body),{p_request_id:null});return reply({request_id:'request',run_id:'run',total:294});});
  const result=await (await handleRequest(request({Authorization:'Bearer user-fixture'},{country:'SE',user_id:'other-user'}))).json();
  assert.equal(result.queued,true);assert.equal(result.done,true);assert.equal(result.request_id,'request');
});
test('manual endpoint reports ownership failures',async t=>{mockFetch(t,async()=>reply({message:'scan request not found'},400));assert.equal((await handleRequest(request({Authorization:'Bearer user'}))).status,403);});
test('unsupported methods cannot trigger work',async()=>{assert.equal((await handleRequest(request({},null,'GET'))).status,405);assert.equal((await handleWorker(request({},null,'GET'))).status,405);});
test('manual endpoint supports browser preflight',async()=>assert.equal((await handleRequest(request({},null,'OPTIONS'))).status,200));
