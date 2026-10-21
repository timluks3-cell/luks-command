-- Retain the existing scanner behavior of saving discovered ATS endpoints.
create or replace function public.luks_finish_scan_batch(p_work_id uuid,p_lease uuid,p_results jsonb)
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
      domain=coalesce(nullif(r->>'ats_url',''),domain),
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

