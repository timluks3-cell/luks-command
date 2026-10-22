
begin;
create unique index if not exists jobs_workspace_owner_key on public.jobs(id,user_id);
create table if not exists public.job_application_references (
 user_id uuid primary key references auth.users(id) on delete cascade,
 content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object' and octet_length(content::text)<=500000),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.job_workspaces (
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null,
 content jsonb not null default '{}'::jsonb check (jsonb_typeof(content)='object' and octet_length(content::text)<=300000),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(user_id,job_id),
 foreign key(job_id,user_id) references public.jobs(id,user_id) on delete cascade
);
alter table public.job_application_references enable row level security;
alter table public.job_workspaces enable row level security;
revoke all on public.job_application_references,public.job_workspaces from public,anon,authenticated;
grant select,insert,update on public.job_application_references,public.job_workspaces to authenticated;
do $$ begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_application_references' and policyname='own_references') then
  create policy own_references on public.job_application_references for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='job_workspaces' and policyname='own_workspaces') then
  create policy own_workspaces on public.job_workspaces for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
 end if;
end $$;
create or replace function public.luks_workspace_revision() returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now();new.revision=old.revision+1;return new;end $$;
revoke all on function public.luks_workspace_revision() from public,anon,authenticated;
drop trigger if exists references_revision on public.job_application_references;
create trigger references_revision before update on public.job_application_references for each row execute function public.luks_workspace_revision();
drop trigger if exists workspace_revision on public.job_workspaces;
create trigger workspace_revision before update on public.job_workspaces for each row execute function public.luks_workspace_revision();
commit;
