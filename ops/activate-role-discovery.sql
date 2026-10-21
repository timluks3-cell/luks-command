-- Run only AFTER deploying the scan-worker with role-discovery support.
-- One bounded search per saved role; existing sources and records are preserved.
with added as (
  insert into public.job_sources(user_id,name,domain,source_group,enabled)
  select p.user_id,'Discovery · '||role,'discovery:dk:'||role,'Denmark/Role discovery',true
  from public.career_profiles p cross join lateral jsonb_array_elements_text(p.preferred_roles) as roles(role)
  where p.user_id='2ee8af42-ff93-4f05-b1ff-00909eec6f46'
    and length(trim(role))>=3
    and not exists(select 1 from public.job_sources s where s.user_id=p.user_id and lower(s.domain)=lower('discovery:dk:'||role))
  on conflict(user_id,domain) do nothing
  returning name
)
select count(*) as discovery_sources_added from added;
-- The next scan snapshots all enabled sources, including these discovery searches.
select luks_private.enqueue_scan('2ee8af42-ff93-4f05-b1ff-00909eec6f46'::uuid);
