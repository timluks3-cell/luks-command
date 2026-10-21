# LUKS COMMAND

Static dashboard backed by Supabase. Netlify publishes the repository root.

The browser frontend is `index.html`, `scanner.js`, and `job-role-categories.js`.
The scanner backend source is tracked under `supabase/functions/scan-jobs/`.

Run regression checks with Node 24:

```sh
node --test tests/scan-jobs.test.mjs
```

See [recurring scan implementation notes](docs/recurring-scans.md) for the verified
backend baseline, deployment requirements and remaining scheduling work.
Unattended recurring scans are not enabled by this repository change.
