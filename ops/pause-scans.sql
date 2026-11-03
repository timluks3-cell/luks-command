-- Emergency stop: pauses worker processing, including manually queued scans.
-- Automatic daily scan creation is independently disabled in manual-only mode.
-- Existing requests, progress, vacancy records and application history are preserved.
update luks_private.scan_schedule set enabled=false;
select cron.alter_job(job_id := (select jobid from cron.job where jobname='luks-command-background-scans'), active := false);
