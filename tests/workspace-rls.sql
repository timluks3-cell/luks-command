
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.jobs(id uuid primary key,user_id uuid not null references auth.users);
\i ops/job-workspace-schema.sql
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into jobs values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into job_application_references(user_id,content) values ('11111111-1111-4111-8111-111111111111','{"cv":"Account A"}'),('22222222-2222-4222-8222-222222222222','{"cv":"Account B"}');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin
 if (select count(*) from job_application_references)<>1 then raise exception 'Cross-account reference leak';end if;
end$$;
insert into job_workspaces(user_id,job_id,content) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"application":"Own draft"}');
do $$begin
 begin
  insert into job_workspaces(user_id,job_id) values ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  raise exception 'Foreign job accepted';
 exception when foreign_key_violation then null;end;
 begin
  insert into job_workspaces(user_id,job_id) values ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  raise exception 'Foreign owner accepted';
 exception when insufficient_privilege then null;end;
end$$;
update job_application_references set content='{"cv":"Updated"}' where user_id=auth.uid() and revision=1;
do $$declare affected int;begin
 if (select revision from job_application_references)<>2 then raise exception 'Revision did not advance';end if;
 update job_application_references set content='{}' where user_id=auth.uid() and revision=1;
 get diagnostics affected=row_count;if affected<>0 then raise exception 'Stale write accepted';end if;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$begin
 if (select count(*) from job_workspaces)<>0 then raise exception 'Cross-account draft leak';end if;
end$$;
reset role;
set role anon;
do $$begin
 begin
  perform * from public.job_application_references;raise exception 'Anonymous references readable';
 exception when insufficient_privilege then null;end;
 begin
  perform * from public.job_workspaces;raise exception 'Anonymous drafts readable';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'Private workspace isolation and revision checks passed' as result;
