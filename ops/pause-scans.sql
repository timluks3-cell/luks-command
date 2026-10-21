-- Preserve requests, results and saved cursors. Pause future worker dispatches.
update luks_private.scan_schedule set enabled=false;
select cron.unschedule(jobid) from cron.job where jobname='luks-command-background-scans';
