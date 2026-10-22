# Job workspace and ChatGPT handoff

This release adds a saved light/dark/system appearance choice and an accessible job workspace opened from vacancy cards and the tracking board. It reuses jobs for advert text, verification and stage updates. Existing applications are not overwritten.

The first release uses a manual ChatGPT handoff, not subscription automation. The user reviews a complete advert and master documents, copies a factual-source packet, pastes it into ChatGPT, imports the returned JSON and checks the drafts. No generation API or employer-submission endpoint is added. Keyword evidence is labelled as keyword overlap, not an AI capability score.

Master CV text, example-letter text and shared header details live in job_application_references. Original PDFs are not stored: PDF text extraction happens locally with an included PDF.js worker. Drafts, editable advert text, personal follow-up date and workspace notes live in job_workspaces. RLS restricts both tables to their owner; a composite foreign key prevents attaching a workspace to somebody else's job. Revision checks reject lost updates across tabs. No personal reference text or source PDF belongs in GitHub, preview samples or browser localStorage.

PDF exports enforce one A4 application page and two CV pages, refuse overflow and use embedded Arimo (Arial-compatible) fonts with navy/teal headers. Real DOCX files use matching Arial typography and two CV sections. Word pagination must be checked in the target editor. Review confirmation is required before export. The Danish application / English CV requirement overrides the skill's usual advert-language choice. This version does not automatically verify factual claims or run a live LLM.

## Release

1. Review the PR preview with its fictional sample workspace and both themes.
2. Apply ops/job-workspace-schema.sql to the existing Supabase project, then run ownership/advisor checks. It only adds isolated tables, indexes and a revision trigger; no existing jobs, applications or profile rows are deleted or rewritten.
3. Import the supplied personal references privately for the owner's user_id; never put seed content into GitHub. Alternatively import the two PDFs through My master documents after signing in and review the extracted text/header before Save.
4. Merge and verify Netlify serves workspace-core.js, job-workspace.js, job-workspace.css and the vendored tools. Sample runtime/pages are generated only for deploy-preview builds and must be absent in production.
5. Verify one real job loads for its owner, save/reopen a draft, check optimistic conflict handling and export a reviewed package. No Supabase Edge Function deployment is required.

CI builds pinned vendor bundles, runs the existing scanner regressions, exercises packet/expiry/evidence/parser rules, verifies real PDF/DOCX exports, and tests ownership/isolation/concurrency in a separate PostgreSQL container. Pending private reference import and live signed-in smoke testing must be reported rather than claimed complete.
