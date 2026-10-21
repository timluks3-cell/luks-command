# LUKS COMMAND

A static career dashboard backed by Supabase, with background Denmark-only job scans.
Daily scans start at **08:00 Denmark time** and continue with the browser closed.
Manual scans use the same queue and preserve existing applications and tracking stages.

Netlify publishes the frontend from this repository. Supabase functions and SQL migrations
are deployed separately. See [background scan operations](docs/recurring-scans.md).

Run regression checks with Node 24:

```sh
node --test tests/scan-jobs.test.mjs
```

The saved career profile controls search roles. Unavailable job sources are reported;
a scheduled start does not guarantee every provider can be reached.
