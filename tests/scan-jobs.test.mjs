import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const original = readFileSync(new URL('../supabase/functions/scan-jobs/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(original.replace(/^import .*;\s*$/gm, ''));

function fixture({ candidates = [], stage = 'interview', failDiscovery = false, otherOwner = false } = {}) {
  const owner = 'owner';
  const data = {
    career_profiles: [{ user_id: owner, preferred_roles: ['BIM Coordinator'] }],
    job_scan_requests: [{ id: 'request', user_id: owner, status: 'pending' }],
    job_scan_runs: [{ id: 'run', user_id: otherOwner ? 'someone-else' : owner, status: 'running', metadata: {} }],
    job_sources: [{ id: 'source', user_id: owner, enabled: true, name: 'Fixture employer', useful_hits: 0, rejected_hits: 0 }],
    job_discoveries: [],
    jobs: [{ id: 'existing', user_id: owner, job_url: 'https://example.test/existing', status: stage }],
  };
  let handler;
  const writes = [];
  function from(table) {
    const filters = [];
    let action = 'select', payload, options, count = false;
    const q = {
      select(_columns, opts) { count = !!opts?.count; return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      order() { return q; }, range() { return q; },
      insert(value) { action = 'insert'; payload = value; return q; },
      upsert(value, opts) { action = 'upsert'; payload = value; options = opts; return q; },
      update(value) { action = 'update'; payload = value; return q; },
      single() { return execute(true); }, maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      if (failDiscovery && table === 'job_discoveries' && action !== 'select') return { data: null, error: { message: 'database unavailable' } };
      let rows = data[table].filter(row => filters.every(fn => fn(row)));
      if (action !== 'select') writes.push({ table, action, payload: structuredClone(payload) });
      if (action === 'update') rows.forEach(row => Object.assign(row, payload));
      if (action === 'insert' || action === 'upsert') {
        let row = action === 'upsert' && options?.onConflict ? data[table].find(row => row.user_id === payload.user_id && row.job_url === payload.job_url) : null;
        if (row) Object.assign(row, payload);
        else { row = { id: `new-${table}-${data[table].length}`, ...payload }; data[table].push(row); }
        rows = [row];
      }
      return { data: single ? rows[0] ?? null : structuredClone(rows), count: count ? rows.length : undefined, error: null };
    }
    return q;
  }
  const context = vm.createContext({
    URL, Request, Response, AbortController, console, setTimeout, clearTimeout,
    createClient: () => ({ from, auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) } }),
    Deno: { env: { get: () => 'fixture-only' }, serve: fn => { handler = fn; } },
  });
  vm.runInContext(code, context);
  context.fixtureCandidates = candidates;
  vm.runInContext('scanSource = async (source) => ({source, checked: fixtureCandidates, checkedAt: new Date().toISOString(), searchOk: true, provider: "fixture"})', context);
  return { data, writes, context, invoke: (body = {}) => handler(new Request('https://example.test/scan-jobs', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify({ scan_request_id: 'request', run_id: 'run', offset: 0, limit: 2, ...body }) })) };
}

test('Denmark policy handles Unicode boundaries, country codes, foreign precedence and unknowns', () => {
  const { context } = fixture();
  const cases = [
    ['Denmark', true], ['Danmark', true], ['DK', true], ['DNK', true],
    ['Copenhagen, Denmark', true], ['København', true], ['Ishøj', true], ['Hørsholm', true],
    ['Copenhagen, SE', false], ['Copenhagen, Sweden', false], ['New Zealand', false],
    ['Denmark / India', false], ['Remote', false], ['', false], [null, false],
    ['NotDenmark', false], ['Copenhagenish', false], ['Copenhagen, Rwanda', false],
  ];
  // Free-text fallback is a conservative city/country heuristic, not a geocoder.
  assert.equal(context.inDenmark('Copenhagen', 'SE'), false);
  assert.equal(context.inDenmark('Copenhagen', 'unknown'), false);
  assert.equal(context.inDenmark('Remote', 'DK'), true);
  for (const [location, expected] of cases) assert.equal(context.inDenmark(location), expected, String(location));
});

const candidate = (url, location) => ({ title: 'BIM Coordinator', url, location, verified: true, score: 85, reason: 'fixture feed', snippet: 'BIM' });

test('server rejects foreign/unknown candidates regardless of country request hints', async () => {
  const f = fixture({ candidates: [candidate('https://example.test/dk', 'Ishøj, Denmark'), candidate('https://example.test/se', 'Stockholm, Sweden'), candidate('https://example.test/unknown', null)] });
  const response = await f.invoke({ country: 'SE', country_code: 'SE' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.imported, 1);
  assert.equal(result.rejected, 2);
  assert.deepEqual(f.data.job_discoveries.map(row => row.job_url), ['https://example.test/dk']);
  assert.equal(f.data.jobs.length, 2);
});

for (const stage of ['saved', 'ready', 'applied', 'interview', 'offer', 'rejected', 'closed', 'dismissed']) {
  test(`rescanning preserves ${stage} and refreshes the existing discovery`, async () => {
    const f = fixture({ stage, candidates: [candidate('https://example.test/existing', 'Denmark')] });
    f.data.job_discoveries.push({ id: 'discovery', user_id: 'owner', job_url: 'https://example.test/existing', imported_job_id: 'existing' });
    assert.equal((await f.invoke()).status, 200);
    assert.equal(f.data.jobs[0].status, stage);
    assert.equal(f.data.jobs.length, 1);
    assert.equal(f.data.job_discoveries.length, 1);
    assert.equal(f.data.job_discoveries[0].imported_job_id, 'existing');
    assert.equal(f.data.job_scan_requests[0].result_run_id, 'run');
  });
}

test('a run belonging to another owner cannot be updated through the admin client', async () => {
  const f = fixture({ otherOwner: true });
  assert.equal((await f.invoke()).status, 404);
  assert.equal(f.writes.length, 0);
});

test('an unknown request cannot be used to start a scan', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ scan_request_id: 'unknown' })).status, 404);
  assert.equal(f.writes.length, 0);
});

test('a linked request cannot be reassigned to another run', async () => {
  const f = fixture();
  f.data.job_scan_requests[0].result_run_id = 'another-run';
  assert.equal((await f.invoke()).status, 409);
  assert.equal(f.writes.length, 0);
});

test('fractional batch cursors are rejected before writes', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ offset: 0.5 })).status, 400);
  assert.equal(f.writes.length, 0);
});

test('a database failure does not advance or complete the run', async () => {
  const f = fixture({ failDiscovery: true, candidates: [candidate('https://example.test/dk', 'Denmark')] });
  assert.equal((await f.invoke()).status, 500);
  assert.equal(f.data.job_scan_runs[0].status, 'running');
  assert.equal(f.data.job_scan_runs[0].metadata.processed_sources, undefined);
  assert.equal(f.data.jobs.length, 1);
});
