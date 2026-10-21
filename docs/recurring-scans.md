# Recurring scans: verified baseline and next deployment step

## Verified on 21 October 2026

The active Supabase project is `wqopxxzlfuifcfukydvn`. The imported
`supabase/functions/scan-jobs/index.ts` is based on deployed version 10,
bundle SHA-256 `621fec23481bc9f1564ce7626e7efde81ec754db346755ec0151f60873ebd4cc`.
The original source was retrieved through Supabase's management connector.
The configuration records the observed `verify_jwt = true` setting.
This is a partial backend source baseline, not a complete database bootstrap.
The separately deployed `verify-job` function is unchanged and is not included.

The deployed scanner already used `inDenmark()` before discovery/import writes.
Its location list accepted "New Zealand" via "Zealand" and did not recognize
DK/DNK. This change fixes those cases, rejects foreign country names in
English/Danish, and gives
explicit structured country values precedence over city-name hints. Foreign,
ambiguous multi-country and unknown locations are excluded from imports.
The city fallback remains a heuristic: it is not a complete Denmark geocoder.

The backend also preserves every existing job tracking stage, refreshes discoveries
through the existing `(user_id, job_url)` unique constraint, validates supplied
request/run ownership, links a request to its run before batch work, and reports
discovery/job/progress write failures instead of silently advancing the cursor.
No historical records are removed or reclassified by this change.

## What is still browser-dependent

`scanner.js: requestJobScan()` creates or resumes `job_scan_requests` and repeatedly
calls `scan-jobs` with `{scan_request_id, run_id, offset, limit: 2}`. Each response
returns `run_id`, `next_offset`, `total`, `done`, and per-batch counters.
`pollScanRequest()` only observes a request; currently nothing calls it.

The scanner uses a Supabase Auth user session. It does not use the user's browser
to visit employer pages: source retrieval already happens in the Edge Function.
Source-specific anonymous ATS tokens/cookies are acquired inside the function.

There is no database scan lease and no `pg_cron`/`pg_net` extension installed.
`window.__liveScanRunning` prevents duplicate execution in one browser page only.
Offset pagination depends on the current enabled source ordering. Imports and
checkpoint updates are not one database transaction; replaying a failed batch
can repeat source counters. These limitations must be resolved before claiming
reliable unattended execution. This PR does not enable a recurring schedule.

## Next smallest recurring-scan implementation

1. Add `supabase/functions/scan-worker/index.ts` with machine authentication.
   Do not remove user authentication from the public `scan-jobs` endpoint.
   Extract shared scan logic only after adding a worker authorization boundary.
2. Create a migration using `supabase migration new scan_worker`. Add a per-owner
   lease and atomic claim/checkpoint operations, a stable source-ID snapshot,
   bounded retries, and a daily enqueue key. Preserve existing request/run IDs.
   Treat job/discovery imports as repeatable operations and persist batch results
   once so recovery cannot inflate run/source counters. Only service credentials
   may claim worker tasks. Ordinary users retain access to their own records.
3. Enqueue once per owner/local day; run a short worker tick to continue batches.
   Use `pg_cron` + `pg_net` and Vault, or a separately authenticated external runner.
   A daily HTTP call processing only two sources is not a full daily scan.
4. Change `requestJobScan()` to enqueue/resume and call `pollScanRequest(req.id)`.
   Both manual and scheduled requests must use the same server lease.
5. Test interruption/recovery, simultaneous requests, stable source pagination,
   missing credentials, expired leases, database failures, unknown/foreign
   locations, and preservation of applications and all job stages.

## Access and activation

- GitHub: source, regression tests, CI, worker implementation and migration files.
- Supabase: inspect/apply the migration, deploy functions, configure worker
  authentication, enable scheduling extensions, provision Vault entries, and
  inspect actual function/database logs. Never commit secret values.
- Netlify: publishes frontend changes only. It does not deploy Supabase functions
  or install SQL schedules. Its current publish root is the repository root.
- Scheduling decision: daily time and IANA timezone must be recorded before
  activation; no daily execution time is assumed in this baseline.
- Any existing ChatGPT monitor should be checked before enabling a second daily
  enqueue source. This change does not modify ChatGPT automations.

## Checks and deployment

Run `node --test tests/scan-jobs.test.mjs` with Node 24. Tests execute the actual
TypeScript handler after stripping its types, with an in-memory Supabase client
and source fixtures. They need no credentials and never contact live job sites.
They verify imports and status preservation, not real-provider connectivity or
Deno dependency resolution. GitHub Actions runs these checks on pull requests.

Deploy `scan-jobs` only after these checks pass, keeping JWT verification enabled.
The function uses the pre-existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` environment variables. No additional secrets or schema
changes are required for this first step. Existing runtime import specifiers are
retained from deployed v10; dependency pinning/lockfile generation needs Deno
validation before a future deployment pipeline is added.

After deployment, check that unauthenticated calls are rejected, perform a bounded
authenticated scan, and verify the saved results and tracking stages. A passing
mock suite alone is not evidence that the deployed backend has changed.

Reference: https://supabase.com/docs/guides/functions/schedule-functions
