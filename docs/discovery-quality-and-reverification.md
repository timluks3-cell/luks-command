# Discovery quality and vacancy reverification

## Evidence from 21 October 2026

A read-only live diagnostic for `BIM Coordinator` returned eight unrelated migraine
research articles through Bing tracking links. The role discovery implementation
counted any search result as a successful source and attempted verification of
unrelated pages. Country admission correctly rejected them, so no discovery rows
survived persistence and the stored data could not explain why all were rejected.
Two generic-board nursing vacancies also passed the old relevance check because
it searched full page text, including unrelated project/footer terms.

## Changes

- Decode HTML entities and Bing base64url redirects to the canonical public URL.
  URL-encoded vacancy IDs are not decoded a second time.
- Require title relevance in search candidates and verified adverts, with word
  boundaries for short terms such as BIM/IKT. Full descriptions cannot qualify an
  unrelated occupation. This conservative policy can miss adjacent roles whose
  titles do not contain any saved/base role term; add deliberate aliases to the
  career profile rather than silently accepting unrelated page text.
- Report irrelevant/generic-only search output as a source failure. This exposes
  upstream search quality problems; it does not promise a replacement search API
  or improved vacancy yield from an unavailable provider.
- Store bounded rejection samples and reason counts in existing scan diagnostics,
  including candidates rejected before country admission. No schema migration.
- Track the existing verify-job endpoint in GitHub, with a shared conservative
  verifier and explicit gateway JWT configuration. No 30-day automatic expiration:
  a vacancy can remain open longer if the live page still identifies it and
  contains an application signal. HTTP 404/410, explicit closure and passed
  deadlines are conclusive negative evidence. Blocked/error/generic/mismatched
  pages are inconclusive and do not refresh verified_at.
- The frontend includes the saved title when requesting verification.

## One-time production cleanup completed

Eight passed-deadline rows had verified_open cleared and verification_status set
as expired. Their tracking stages and notes were preserved.

132 stale vacancies in active tracking stages were checked against their live URLs:
13 were confirmed open, 1 confirmed closed, 107 inconclusive, 4 blocked and 7 fetch
errors. Only the 14 conclusive results were applied, using the original updated_at
as an optimistic guard. Inconclusive rows retained their records; the existing
seven-day freshness filter continues to exclude stale verification from current
matches. Closed/dismissed tracking history was excluded from this live check.

Application record count remained 2 and its checksum stayed
`59a8de6a37fe88e2b9dd6d2a889cd0e3`. Updates never set tracking status, notes or
application fields. A follow-up check found zero passed-deadline rows still marked
verified_open. Background imports may change job totals during this work.

`scripts/reverify-jobs.mjs` reproduces read-only evidence collection from an
explicit export. It writes evidence locally and performs no database mutations.
Never persist inconclusive results as fresh verification, and do not apply an
old result over a newer scan update.

## Validation and deployment

Run Node regression tests and Deno checks for all function entry points.
Merge the PR, let Netlify update the frontend, then deploy scan-worker with all
shared dependencies and deploy verify-job with JWT verification enabled. Keep
scan-worker's existing Vault-token authentication unchanged. No new credentials,
schedules, source rows or database schema changes are required.

Post-deployment: confirm unrelated-only search responses appear as source errors,
inspect rejection diagnostics, and check an identifiable current/closed vacancy
through verify-job. Existing unrelated saved jobs need review; this change does
not delete or automatically change their tracking stages.
