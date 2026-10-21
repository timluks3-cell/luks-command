# Expired postings

Dashboard opportunities and current matches require fresh vacancy verification and a deadline that has not passed. Scanner discovery results, the broader available-jobs view, and the default career filter also exclude past deadlines, explicit closed/expired states and conclusive closure evidence. A stale `verified_open` flag cannot override those exclusions.

Application records are not deleted or moved. Explicit history views and the application board retain previously tracked jobs, including expired adverts. These records are history, not current openings. Unknown or unverified discovery records are still labelled for review; absence of an expiry date does not prove that applications remain open.

The shared worker admission step in `supabase/functions/_shared/batch.ts` independently checks every provider's deadline before persistence. Expired candidates are recorded as rejected diagnostics with `verified: false` and `Application deadline has passed`, preventing import as a verified vacancy even if a provider reports them as open.

Deploy the frontend through the normal main-branch Netlify build and deploy `scan-worker` with its updated shared `batch.ts`. `scan-jobs` and `verify-job` are unchanged. No database migration or deletion is required.

Validation: `node --test tests/*.test.mjs`, `node --check scanner.js`, and `deno check supabase/functions/scan-worker/index.ts`. `tests/expired-postings.test.mjs` covers expired flags, deadlines, closure evidence, default lists, retained applied history and worker admission.
