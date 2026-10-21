-- Additive queue infrastructure; existing jobs, applications and history are retained.
create schema if not exists luks_private;
revoke all on schema luks_private from public, anon, authenticated;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table luks_private.scan_schedule (
  user_id uuid primary key references auth.users(id),
  enabled boolean not null default false,
  timezone text not null default 'Europe/Copenhagen',
  local_hour integer not null default 8 check(local_hour between 0 and 23),
  last_day date
);
create table luks_private.scan_work (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  request_id uuid not null unique references public.job_scan_requests(id),
  run_id uuid not null unique references public.job_scan_runs(id),
  sources jsonb not null,
  cursor integer not null default 0,
  status text not null default 'pending' check(status in ('pending','running','completed','failed')),
  lease uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index scan_work_one_active_owner on luks_private.scan_work(user_id) where status in ('pending','running');
alter table luks_private.scan_schedule enable row level security;
alter table luks_private.scan_work enable row level security;
revoke all on all tables in schema luks_private from public, anon, authenticated;

-- Only invoked by the authenticated wrapper or the private scheduler.
create function luks_private.enqueue_scan(p_owner uuid, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w luks_private.scan_work; rid uuid; runid uuid; snapshot jsonb;
begin
  if p_owner is null then raise exception 'unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 87316));
  if p_request_id is not null and not exists(select 1 from public.job_scan_requests where id=p_request_id and user_id=p_owner) then
    raise exception 'scan request not found';
  end if;
  select * into w from luks_private.scan_work where user_id=p_owner and status in ('pending','running') limit 1;
  if found then return jsonb_build_object('request_id',w.request_id,'run_id',w.run_id,'total',jsonb_array_length(w.sources),'reused',true); end if;
  if p_request_id is not null then
    select * into w from luks_private.scan_work where request_id=p_request_id;
    if found then return jsonb_build_object('request_id',w.request_id,'run_id',w.run_id,'total',jsonb_array_length(w.sources),'reused',true); end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by source_group,name,id),'[]'::jsonb) into snapshot
    from public.job_sources s where user_id=p_owner and enabled;
  insert into public.job_scan_runs(user_id,status,summary,metadata)
    values(p_owner,'running','Queued for background collection',jsonb_build_object('worker_version',1,'country','DK','processed_sources',0,'total_sources',jsonb_array_length(snapshot))) returning id into runid;
  if p_request_id is null then
    insert into public.job_scan_requests(user_id,status,message,result_run_id)
      values(p_owner,'pending','Queued; safe to close the browser',runid) returning id into rid;
  else
    rid=p_request_id;
    update public.job_scan_requests set status='pending',completed_at=null,result_run_id=runid,message='Queued; safe to close the browser' where id=rid and user_id=p_owner;
  end if;
  insert into luks_private.scan_work(user_id,request_id,run_id,sources) values(p_owner,rid,runid,snapshot);
  return jsonb_build_object('request_id',rid,'run_id',runid,'total',jsonb_array_length(snapshot),'reused',false);
end; $$;
revoke all on function luks_private.enqueue_scan(uuid,uuid) from public,anon,authenticated;

create function public.luks_request_scan(p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return luks_private.enqueue_scan(auth.uid(),p_request_id);
end; $$;
revoke all on function public.luks_request_scan(uuid) from public,anon;
grant execute on function public.luks_request_scan(uuid) to authenticated;

create function luks_private.canonical_job_url(raw text)
returns text language plpgsql immutable set search_path='' as $$
declare value text; path text; query text;
begin
  value=regexp_replace(lower(split_part(coalesce(raw,''),'#',1)),'^https?://(www\.)?','');
  path=rtrim(split_part(value,'?',1),'/');
  select string_agg(item,'&' order by item) into query from unnest(string_to_array(split_part(value,'?',2),'&')) item
    where item<>'' and split_part(item,'=',1) !~ '^(utm_.*|fbclid|gclid)$';
  return path || case when query is null then '' else '?'||query end;
end; $$;
revoke all on function luks_private.canonical_job_url(text) from public,anon,authenticated;

create function public.luks_claim_scan_batch(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w luks_private.scan_work; token text; leaseid uuid; batch jsonb; profile jsonb;
begin
  -- This function is executable only by service_role; token authenticates the HTTP caller.
  select decrypted_secret into token from vault.decrypted_secrets where name='luks_worker_token';
  if token is null or p_token is null or extensions.digest(p_token,'sha256')<>extensions.digest(token,'sha256') then raise exception 'invalid worker token'; end if;
  select * into w from luks_private.scan_work where status in ('pending','running') and next_attempt<=now()
    and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  if w.attempts>=5 then
    update luks_private.scan_work set status='failed',lease=null,lease_until=null where id=w.id;
    update public.job_scan_requests set status='failed',completed_at=now(),message='Repeated worker interruption; saved progress retained' where id=w.request_id;
    update public.job_scan_runs set status='failed',completed_at=now(),summary='Worker could not complete this batch after five attempts' where id=w.run_id;
    return null;
  end if;
  if w.cursor>=jsonb_array_length(w.sources) then
    update luks_private.scan_work set status='completed' where id=w.id;
    update public.job_scan_requests set status='completed',completed_at=now(),message='Background scan completed: no remaining sources' where id=w.request_id;
    update public.job_scan_runs set status='completed',completed_at=now(),summary='Background scan completed: no remaining sources' where id=w.run_id;
    return null;
  end if;
  leaseid=gen_random_uuid();
  update luks_private.scan_work set status='running',lease=leaseid,lease_until=now()+interval '150 seconds',attempts=attempts+1 where id=w.id;
  update public.job_scan_requests set status='running',started_at=coalesce(started_at,now()),message='Background scan: '||w.cursor||' / '||jsonb_array_length(w.sources)||' sources processed' where id=w.request_id;
  select jsonb_agg(value order by ordinal) into batch from jsonb_array_elements(w.sources) with ordinality e(value,ordinal) where ordinal>w.cursor and ordinal<=w.cursor+4;
  select to_jsonb(p) into profile from public.career_profiles p where user_id=w.user_id;
  return jsonb_build_object('work_id',w.id,'lease',leaseid,'sources',batch,'profile',coalesce(profile,'{}'::jsonb));
end; $$;
revoke all on function public.luks_claim_scan_batch(text) from public,anon,authenticated;
grant execute on function public.luks_claim_scan_batch(text) to service_role;

create function public.luks_finish_scan_batch(p_work_id uuid,p_lease uuid,p_results jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w luks_private.scan_work; r jsonb; c jsonb; expected jsonb; jobid uuid; n integer; i integer=0;
  nfound integer=0; nverified integer=0; nimported integer=0; nrejected integer=0; nfailed integer=0;
  finished boolean; final_status text; newcursor integer; seenurls text[]='{}'; canonical text;
begin
  select * into w from luks_private.scan_work where id=p_work_id for update;
  if not found or w.status not in ('pending','running') or p_lease is null or w.lease is null or w.lease_until is null or w.lease is distinct from p_lease or w.lease_until<now() then raise exception 'stale scan lease'; end if;
  if jsonb_typeof(p_results)<>'array' then raise exception 'invalid batch results'; end if;
  n=jsonb_array_length(p_results);
  if n<>least(4,jsonb_array_length(w.sources)-w.cursor) then raise exception 'incorrect batch size'; end if;
  for r in select value from jsonb_array_elements(p_results) loop
    expected=w.sources->(w.cursor+i);
    if r->>'source_id' is distinct from expected->>'id' then raise exception 'source snapshot mismatch'; end if;
    if not coalesce((r->>'ok')::boolean,false) then nfailed=nfailed+1; end if;
    i=i+1;
  end loop;
  if nfailed>0 and w.attempts<3 then
    update luks_private.scan_work set lease=null,lease_until=null,next_attempt=now()+interval '30 seconds' where id=w.id;
    update public.job_scan_requests set message='Retrying blocked or failed sources; saved progress retained' where id=w.request_id;
    return jsonb_build_object('retry',true,'done',false,'processed_sources',w.cursor);
  end if;
  -- All imports, source counters and the cursor commit together. A lost HTTP response
  -- cannot double-count: the old lease is invalid after this transaction commits.
  for r in select value from jsonb_array_elements(p_results) loop
    nfound=nfound+coalesce((r->>'found')::integer,0);
    nrejected=nrejected+coalesce((r->>'rejected')::integer,0);
    update public.job_sources set last_checked_at=now(),
      useful_hits=useful_hits+(select count(*) from jsonb_array_elements(r->'candidates') x where (x->>'verified')::boolean),
      rejected_hits=rejected_hits+coalesce((r->>'rejected')::integer,0)
      where id=(r->>'source_id')::uuid and user_id=w.user_id;
    for c in select value from jsonb_array_elements(r->'candidates') loop
      -- Only the authenticated worker may submit this server admission evidence.
      if c->>'country_code' is distinct from 'DK' then raise exception 'non-DK import rejected'; end if;
      if coalesce(c->>'job_url','') !~* '^https?://' then raise exception 'invalid vacancy URL'; end if;
      canonical=luks_private.canonical_job_url(c->>'job_url');
      if canonical=any(seenurls) then continue; end if;
      seenurls=array_append(seenurls,canonical);
      jobid=null;
      if (c->>'verified')::boolean then
        nverified=nverified+1;
        select j.id into jobid from public.jobs j where user_id=w.user_id
          and luks_private.canonical_job_url(job_url)=canonical
          order by case when status in ('applied','interview','offer','rejected','closed','dismissed') then 0 else 1 end,created_at,id limit 1 for update;
        if jobid is null then
          insert into public.jobs(user_id,title,company,job_url,source_name,location,description,status,match_score,verified_open,verified_at,verification_status,verification_evidence,published_at,deadline)
          values(w.user_id,c->>'title',c->>'company',c->>'job_url',r->>'source_name',c->>'location',c->>'snippet','discovered',(c->>'score')::integer,true,now(),'open',c->>'reason',(c->>'published_at')::timestamptz,(c->>'deadline')::timestamptz) returning id into jobid;
          nimported=nimported+1;
        else
          -- Never write status, notes or application fields on a rescan.
          update public.jobs set title=c->>'title',company=c->>'company',source_name=r->>'source_name',location=c->>'location',description=c->>'snippet',
            match_score=(c->>'score')::integer,verified_open=true,verified_at=now(),verification_status='open',verification_evidence=c->>'reason',
            published_at=coalesce((c->>'published_at')::timestamptz,published_at),deadline=coalesce((c->>'deadline')::timestamptz,deadline),updated_at=now()
            where id=jobid and user_id=w.user_id;
        end if;
      end if;
      insert into public.job_discoveries(user_id,source_name,title,company,job_url,location,snippet,verified_open,verified_at,verification_status,verification_evidence,match_score,rejected_reason,published_at,deadline,imported_job_id)
      values(w.user_id,r->>'source_name',c->>'title',c->>'company',c->>'job_url',c->>'location',c->>'snippet',(c->>'verified')::boolean,now(),case when (c->>'verified')::boolean then 'open' else 'unverified' end,c->>'reason',(c->>'score')::integer,case when (c->>'verified')::boolean then null else c->>'reason' end,(c->>'published_at')::timestamptz,(c->>'deadline')::timestamptz,jobid)
      on conflict(user_id,job_url) do update set verified_open=excluded.verified_open,verified_at=excluded.verified_at,
        verification_status=excluded.verification_status,verification_evidence=excluded.verification_evidence,match_score=excluded.match_score,
        imported_job_id=coalesce(excluded.imported_job_id,public.job_discoveries.imported_job_id);
    end loop;
  end loop;
  newcursor=w.cursor+n; finished=newcursor>=jsonb_array_length(w.sources);
  select case when coalesce((metadata->>'failed_sources')::integer,0)+nfailed>0 then 'partial' else 'completed' end into final_status from public.job_scan_runs where id=w.run_id;
  update public.job_scan_runs set sources_checked=sources_checked+n-nfailed,vacancies_found=vacancies_found+nfound,
    verified_open=verified_open+nverified,imported_count=imported_count+nimported,rejected_count=rejected_count+nrejected,
    status=case when finished then final_status else 'running' end,completed_at=case when finished then now() else null end,
    summary=case when finished then 'Background Denmark scan finished; failed sources are reported separately' else 'Background Denmark scan in progress' end,
    metadata=metadata||jsonb_build_object('processed_sources',newcursor,'failed_sources',coalesce((metadata->>'failed_sources')::integer,0)+nfailed,
      'diagnostics',coalesce(metadata->'diagnostics','[]'::jsonb)||(select jsonb_agg(value-'candidates') from jsonb_array_elements(p_results))) where id=w.run_id;
  update public.job_scan_requests set status=case when finished then final_status else 'running' end,
    completed_at=case when finished then now() else null end,message='Background scan: '||newcursor||' / '||jsonb_array_length(w.sources)||' sources processed' where id=w.request_id;
  update luks_private.scan_work set cursor=newcursor,status=case when finished then 'completed' else 'running' end,
    lease=null,lease_until=null,attempts=0,next_attempt=now() where id=w.id;
  return jsonb_build_object('done',finished,'processed_sources',newcursor,'total',jsonb_array_length(w.sources),'imported',nimported,'failed_sources',nfailed);
end; $$;
revoke all on function public.luks_finish_scan_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.luks_finish_scan_batch(uuid,uuid,jsonb) to service_role;

create function public.luks_fail_scan_batch(p_work_id uuid,p_lease uuid,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare w luks_private.scan_work;
begin
  select * into w from luks_private.scan_work where id=p_work_id for update;
  if not found or w.lease is distinct from p_lease then return; end if;
  update luks_private.scan_work set lease=null,lease_until=null,next_attempt=now()+interval '30 seconds',status=case when attempts>=5 then 'failed' else 'running' end where id=w.id;
  update public.job_scan_requests set status=case when w.attempts>=5 then 'failed' else 'running' end,
    completed_at=case when w.attempts>=5 then now() else null end,message='Worker retry: '||left(p_error,500) where id=w.request_id;
  if w.attempts>=5 then update public.job_scan_runs set status='failed',completed_at=now(),summary='Worker failed after five attempts; progress retained' where id=w.run_id; end if;
end; $$;
revoke all on function public.luks_fail_scan_batch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.luks_fail_scan_batch(uuid,uuid,text) to service_role;

-- Generate and retain the machine token inside Vault; never return it to the caller.
do $$ begin
  if not exists(select 1 from vault.secrets where name='luks_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'luks_worker_token');
  end if;
end; $$;

create function luks_private.dispatch_tick()
returns void language plpgsql security definer set search_path='' as $$
declare control luks_private.scan_schedule; day date; local_stamp timestamp; token text;
begin
  for control in select * from luks_private.scan_schedule where enabled for update skip locked loop
    local_stamp=now() at time zone control.timezone; day=local_stamp::date;
    if extract(hour from local_stamp)>=control.local_hour and (control.last_day is null or control.last_day<day) then
      perform luks_private.enqueue_scan(control.user_id);
      update luks_private.scan_schedule set last_day=day where user_id=control.user_id;
    end if;
  end loop;
  if exists(select 1 from luks_private.scan_work where status in ('pending','running') and next_attempt<=now() and (lease_until is null or lease_until<now())) then
    select decrypted_secret into token from vault.decrypted_secrets where name='luks_worker_token';
    perform net.http_post(url:='https://wqopxxzlfuifcfukydvn.supabase.co/functions/v1/scan-worker',
      headers:=jsonb_build_object('Content-Type','application/json','x-luks-worker-token',token),body:='{}'::jsonb,timeout_milliseconds:=90000);
  end if;
end; $$;
revoke all on function luks_private.dispatch_tick() from public,anon,authenticated;
-- Scheduling is activated separately after verification; the migration does not enqueue work.
