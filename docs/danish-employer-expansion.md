# Denmark employer coverage expansion — 21 October 2026

## Live registry update

`ops/danish-employer-expansion.json` contains 34 researched primary career sources.
`ops/expand-danish-employers.sql` was applied to Luks Command: 30 sources inserted,
4 existing URLs improved (Coor, ABC Rådgivende Ingeniører, Norconsult and Sweco).
There are now 324 source records, 323 enabled. The operation retained source IDs,
counters and enabled preferences for existing sources. No job/application records
were modified; post-update counts remained 255 jobs and 2 applications.

The additions cover specialist architecture/engineering firms, modular and house
construction, industrial employers, facilities/cleaning, and logistics. They include
Danish employers and international employers with operations in Denmark. Country
admission applies to the vacancy workplace, never the employer's headquarters.

26 of the 34 career URLs responded with HTTP 200 and a careers signal during a
local public-page check. Eight returned HTTP 403, 455 or 503 from this client:
DIS/CREADIS, Danfoss, Schneider Electric, Kongsvang, Renell, RENLIG,
Rengøringsagenterne and ABC Rådgivende Ingeniører. These are researched real career
sources, but their collection availability is not proven. Do not bypass access
controls or count blocked sources as successfully checked.

## Code changes requiring deployment

- `_shared/scan-core.ts`: extract vacancy-specific JobPosting location, country,
  employer and dates, including `@graph` and arrays. Multi-advert pages, unknown
  workplaces and mixed-country workplaces cannot provide positive DK evidence.
  Existing batch admission and persistence/history rules remain in place.
- Generic checks reject expired structured deadlines. This does not reconcile
  confirmed closures back onto previously saved jobs; that remains separate work.
- Exclude internship/student roles by vacancy title, with word boundaries and
  Danish compound-praktikant handling. An international project or a description
  mentioning mentoring students must not disqualify a regular vacancy.
- Rotate ten bounded search hints through the full term set over successive days.
- `discovery:dk:<saved title>` sources perform an employer-independent search for
  each saved role, inspect at most eight distinct results concurrently, and then
  apply the same workplace/verification admission. Removed/unrecognized roles
  cannot trigger searches; results require an identifiable hiring organization.
- `scanner.js`: show QUEUED/PARTIAL accurately and refresh the header status from
  the same polled request as the progress card.

## Activation order

1. Merge the tested PR and allow Netlify to publish the frontend.
2. Deploy `scan-worker` with all `_shared` files. No schema/auth-policy change is
   required. Deploying only Netlify does not update Supabase.
3. Execute `ops/activate-role-discovery.sql`: add one discovery source for each
   current saved role (62 at inspection time), then enqueue a scan. The SQL is
   idempotent and retains existing source/job/application records.
4. Confirm that the new request snapshots all enabled sources; inspect provider
   diagnostics, persisted DK evidence and unchanged application history. An
   already-running request retains its old source snapshot by design.

This improves discovery beyond the curated registry; it does not guarantee all
Danish companies or every vacancy. Public feeds, search indexing, structured data,
blocked sites and runtime budgets limit coverage. Sources that fail or return no
readable search results are reported, not represented as complete coverage.

## Validation

`node --test tests/*.test.mjs` covers country precedence, history protection,
structured extraction, expired/malformed/multi-advert cases, title exclusions,
role rotation and employer-independent discovery. `node --check scanner.js` and
Deno checks cover the frontend and both function entry points. Live backend smoke
testing is required after deployment; fixture tests do not prove live provider
availability or the completeness of vacancy discovery.
