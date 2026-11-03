-- Manual-only mode: never enroll users in daily scanning or enqueue new scans here.
-- Install the dispatcher to process ONLY work queued by authenticated RUN JOB SCAN clicks.
update luks_private.scan_schedule set enabled=false;
select cron.schedule('luks-command-background-scans','* * * * *','select luks_private.dispatch_tick();');
-- Do NOT call luks_private.enqueue_scan() here.
