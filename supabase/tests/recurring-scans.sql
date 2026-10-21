-- Transactional integration checks. All fixture rows and edits are rolled back.
begin;
do $$
declare owner uuid; queued jsonb; again jsonb; claim jsonb; reclaimed jsonb; saved jsonb; results jsonb; source jsonb; before_apps text; after_apps text; fixture_id uuid;
begin
  select user_id into owner from public.career_profiles limit 1;
  if owner is null then raise exception 'test requires a career profile'; end if;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'[]')) into before_apps from public.applications a;
  assert not has_function_privilege('anon','public.luks_request_scan(uuid)','execute'), 'anon cannot enqueue';
  assert not has_function_privilege('authenticated','public.luks_claim_scan_batch(text)','execute'), 'users cannot claim';
  assert not has_function_privilege('authenticated','public.luks_finish_scan_batch(uuid,uuid,jsonb)','execute'), 'users cannot import';
  assert has_function_privilege('service_role','public.luks_claim_scan_batch(text)','execute'), 'service can claim';
  assert not has_schema_privilege('authenticated','luks_private','usage'), 'private queue is inaccessible';
  begin perform public.luks_claim_scan_batch(repeat('invalid',8)); raise exception 'bad token accepted';
  exception when others then if sqlerrm<>'invalid worker token' then raise; end if; end;
  queued=luks_private.enqueue_scan(owner);
  again=luks_private.enqueue_scan(owner);
  assert queued->>'request_id'=again->>'request_id', 'manual and scheduled requests reuse active owner work';
  select sources->0 into source from luks_private.scan_work where request_id=(queued->>'request_id')::uuid;
  update luks_private.scan_work set sources=jsonb_build_array(source) where request_id=(queued->>'request_id')::uuid;
  -- Source edits after enqueue cannot shift the saved source snapshot.
  update public.job_sources set name='Transactional test name' where id=(source->>'id')::uuid;
  select public.luks_claim_scan_batch(decrypted_secret) into claim from vault.decrypted_secrets where name='luks_worker_token';
  assert claim->'sources'->0->>'name'=source->>'name', 'stable source snapshot';
  select public.luks_claim_scan_batch(decrypted_secret) into again from vault.decrypted_secrets where name='luks_worker_token';
  assert again is null, 'second worker cannot overlap a live lease';
  update luks_private.scan_work set lease_until=now()-interval '1 second' where id=(claim->>'work_id')::uuid;
  select public.luks_claim_scan_batch(decrypted_secret) into reclaimed from vault.decrypted_secrets where name='luks_worker_token';
  assert reclaimed->>'lease'<>claim->>'lease', 'expired lease reclaimed with a new fencing token';
  begin perform public.luks_finish_scan_batch((claim->>'work_id')::uuid,(claim->>'lease')::uuid,'[]'); raise exception 'stale lease accepted';
  exception when others then if sqlerrm<>'stale scan lease' then raise; end if; end;
  insert into public.jobs(user_id,title,company,job_url,status) values(owner,'Fixture BIM role','Fixture','https://example.invalid/fixture-bim?utm_source=original','interview') returning id into fixture_id;
  results=jsonb_build_array(jsonb_build_object('source_id',source->>'id','source_name',source->>'name','ok',true,'provider','fixture','found',1,'rejected',0,'candidates',
    jsonb_build_array(jsonb_build_object('title','Fixture BIM role','company','Fixture','job_url','https://example.invalid/fixture-bim?utm_source=rescan','location','Denmark','country_code','SE','verified',true,'score',85,'reason','transactional test','snippet','BIM'))));
  begin perform public.luks_finish_scan_batch((reclaimed->>'work_id')::uuid,(reclaimed->>'lease')::uuid,results); raise exception 'non-DK import accepted';
  exception when others then if sqlerrm<>'non-DK import rejected' then raise; end if; end;
  assert (select cursor=0 from luks_private.scan_work where id=(reclaimed->>'work_id')::uuid), 'failed transaction does not advance cursor';
  results=jsonb_set(results,'{0,candidates,0,country_code}','"DK"');
  saved=public.luks_finish_scan_batch((reclaimed->>'work_id')::uuid,(reclaimed->>'lease')::uuid,results);
  assert (saved->>'done')::boolean, 'batch reaches completion';
  assert (select status='interview' from public.jobs where id=fixture_id), 'interview status preserved';
  assert (select count(*)=1 from public.jobs where user_id=owner and job_url like 'https://example.invalid/fixture-bim%'), 'canonical URL deduplicated';
  assert (select vacancies_found=1 and verified_open=1 from public.job_scan_runs where id=(queued->>'run_id')::uuid), 'counters saved exactly once';
  begin perform public.luks_finish_scan_batch((reclaimed->>'work_id')::uuid,(reclaimed->>'lease')::uuid,results); raise exception 'replayed result accepted';
  exception when others then if sqlerrm<>'stale scan lease' then raise; end if; end;
  select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'[]')) into after_apps from public.applications a;
  assert before_apps=after_apps, 'applications unchanged';
  assert extract(hour from timestamptz '2026-07-01 06:00:00+00' at time zone 'Europe/Copenhagen')=8, 'summer clock';
  assert extract(hour from timestamptz '2026-12-01 07:00:00+00' at time zone 'Europe/Copenhagen')=8, 'winter clock';
end; $$;
rollback;
select 'queue, lease recovery, atomic imports, replay protection, ownership ACLs, history and DST checks passed' as result;
