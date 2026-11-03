# LUKS COMMAND

A static career dashboard backed by Supabase, with **manual-only Denmark job scans**.

New scans start only when a signed-in user clicks **RUN JOB SCAN** in the website. There is no automatic daily scan. A scan started by the user is queued on the server and may continue after the browser closes. The backend dispatcher checks for work but **must not enqueue scheduled scans**.

Netlify publishes the frontend from this repository. Supabase functions and SQL migrations are deployed separately. See [scan operations](docs/recurring-scans.md).

Run regression checks with Node 24:

```sh
node --test tests/scan-jobs.test.mjs
```

The saved career profile controls search roles. Unavailable job sources are reported. Saved vacancies, application history, and tracking stages remain intact.
