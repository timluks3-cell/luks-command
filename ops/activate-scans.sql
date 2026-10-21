-- Run only after migrations, Edge Functions and bounded live verification pass.
-- Enroll only the current account's existing career-profile owners; never future signups.
insert into luks_private.scan_schedule(user_id,enabled,timezone,local_hour,last_day)
select user_id,true,'Europe/Copenhagen',8,(now() at time zone 'Europe/Copenhagen')::date from public.career_profiles
on conflict(user_id) do update set enabled=true,timezone='Europe/Copenhagen',local_hour=8,last_day=excluded.last_day;
select cron.schedule('luks-command-background-scans','* * * * *','select luks_private.dispatch_tick();');
select luks_private.enqueue_scan(user_id) from public.career_profiles;
select luks_private.dispatch_tick();
