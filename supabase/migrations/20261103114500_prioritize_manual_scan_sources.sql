-- Prioritize historically productive sources for manual scans without skipping any enabled source.
-- Existing queued scan snapshots are immutable and unaffected.
-- Does not enable automatic schedules, enqueue work or modify saved job history.
create or replace function luks_private.enqueue_scan(p_owner uuid, p_request_id uuid default null)
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
  select coalesce(jsonb_agg(to_jsonb(s) order by
      case when coalesce(s.useful_hits,0)>0 then 0 when s.last_checked_at is null then 1 else 2 end,
      case when coalesce(s.useful_hits,0)>0 then s.useful_hits else 0 end desc,
      s.last_checked_at asc nulls first, s.source_group, s.name, s.id),'[]'::jsonb) into snapshot
    from public.job_sources s where user_id=p_owner and enabled;
  insert into public.job_scan_runs(user_id,status,summary,metadata)
    values(p_owner,'running','Manual scan queued; productive sources first',jsonb_build_object('worker_version',1,'country','DK','processed_sources',0,'total_sources',jsonb_array_length(snapshot),'source_priority','historical_usefulness_then_unchecked_then_other')) returning id into runid;
  if p_request_id is null then
    insert into public.job_scan_requests(user_id,status,message,result_run_id)
      values(p_owner,'pending','Manual scan queued; safe to close the browser',runid) returning id into rid;
  else
    rid=p_request_id;
    update public.job_scan_requests set status='pending',completed_at=null,result_run_id=runid,message='Queued; safe to close the browser' where id=rid and user_id=p_owner;
  end if;
  insert into luks_private.scan_work(user_id,request_id,run_id,sources) values(p_owner,rid,runid,snapshot);
  return jsonb_build_object('request_id',rid,'run_id',runid,'total',jsonb_array_length(snapshot),'reused',false);
end; $$;
