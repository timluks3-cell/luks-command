# Background scans

LUKS COMMAND uses a server queue. Manual and daily scans continue after the browser closes.
Daily enqueue is configured for **08:00 Europe/Copenhagen**, including daylight-saving changes.
A minute-level dispatcher only calls the worker while work is eligible. A full scan takes multiple
batches; 08:00 is its start time, not a promised completion time.

## Files and boundaries

- `supabase/functions/scan-jobs/index.ts`: user-authenticated enqueue endpoint. The database
  derives ownership from `auth.uid()`; caller-supplied user/country/offset values cannot change scope.
- `supabase/functions/scan-worker/index.ts`: machine-authenticated worker. A random token stays
  inside Supabase Vault and is verified by a service-only claim RPC before returning any task.
  This endpoint has gateway JWT verification disabled because it performs its own token check.
  The manual endpoint retains JWT verification. No secret is included in browser code or Git.
- `_shared/scan-core.ts`: employer adapters imported from deployed scanner v10, with strengthened
  Denmark admission and all existing source/provider, role and scoring logic retained.
- `_shared/batch.ts`: bounds source collection to 65 seconds, normalizes candidate dates/scores,
  and applies Denmark filtering before persistence. Country hints in requests are not evidence.
- `_shared/backend.ts`: uses built-in fetch to call PostgREST; no external runtime packages.
- `supabase/migrations/`: private queue, server-only RPCs, stable source snapshot and atomic imports.
- `scanner.js`: queues manual requests, observes saved progress and resumes observation on refresh.
- `supabase/tests/recurring-scans.sql`: transactional database regression checks; fixtures roll back.
- `tests/scan-jobs.test.mjs`: Node 24 regression tests for admission, worker and manual endpoints.

## Recovery and record preservation

Each owner has at most one active work item. Requests reuse that item under a transaction lock.
Source order and configuration are snapshotted when queued, so source edits do not shift a cursor.
The worker claims up to four sources with a 150-second lease and a random fencing token.
An interrupted worker is retried after lease expiry; late results from its old token are rejected.
Source failures retry up to three claims, then record failed sources and allow the scan to finish
as `partial`. Repeated persistence/interruption failures stop after five claims and retain progress.

Candidate imports, discovery updates, source counters, run totals and cursor advancement occur in
one database transaction. Replaying a committed result cannot increment counts again. Canonical URL
matching removes tracking parameters while retaining vacancy-identifying query parameters. Existing
job tracking stages, notes and application rows are never overwritten by rescans. Existing duplicate
or foreign historical rows are retained; view filters determine what is shown.

Denmark admission recognizes DK/DNK and Danish cities, rejects foreign countries in English/Danish,
and gives structured country evidence precedence over city hints. Unknown and ambiguous multi-country
locations are excluded. The fallback city list is conservative and is not a complete geocoder.
Collection depends on public employer feeds, ATS endpoints and search fallback availability. Blocked
or unavailable providers are recorded as failures, not claimed as successfully checked. Matching uses
the existing saved career profile and scoring heuristic; this change does not add full-CV AI ranking.

## Deployment and scheduling

Project: `wqopxxzlfuifcfukydvn`. Deploy both functions and their `_shared` dependencies after migrations.
`scan-worker` uses built-in `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`; `scan-jobs` uses
`SUPABASE_URL`/`SUPABASE_ANON_KEY`. The migration generates `luks_worker_token` in Vault without
returning its value. Netlify publishes only the three frontend files from `dist/`; it does not apply migrations or deploy functions. The migrations build on the existing database baseline.

`ops/activate-scans.sql` enables the owner's daily schedule, installs the named minute dispatcher,
and starts one full scan. Activation is separate from schema deployment so tests can run first.
`ops/pause-scans.sql` stops new scheduled execution without deleting records or saved progress.
The ChatGPT daily monitor reports saved results rather than running a second independent importer.

The private queue has deny-by-default RLS and no ordinary-user grants. The user enqueue wrapper is
intentionally SECURITY DEFINER, requires `auth.uid()`, and checks request ownership. Worker RPCs
revoke PUBLIC, anon and authenticated execution and grant only service_role. These intentional
boundaries can appear as informational/private-policy or authenticated-definer advisor notices.

## Validation

```
node --test tests/scan-jobs.test.mjs
npx --yes deno@2.9.6 check supabase/functions/scan-jobs/index.ts supabase/functions/scan-worker/index.ts
node --check scanner.js
```

Run `supabase/tests/recurring-scans.sql` against a project containing a career profile and enabled
sources. It checks owner coalescing, worker ACLs, snapshot stability, lease recovery/fencing,
transaction rollback, country admission, canonical deduplication, history, replay protection and DST.
It sends no HTTP requests and rolls all fixture changes back. Live validation additionally invokes
the deployed worker through `pg_net` with one real source, verifies saved run results, checks that
unauthenticated requests are rejected, and compares application/status preservation baselines.

The original backend baseline was deployed v10, bundle SHA-256
`621fec23481bc9f1564ce7626e7efde81ec754db346755ec0151f60873ebd4cc`.
`verify-job` is a separate existing function and is unchanged.
