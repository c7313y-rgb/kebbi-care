create schema if not exists kebbi_private;
revoke all on schema kebbi_private from public, anon, authenticated;
create table public.kebbi_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 staff_code text unique not null, display_name text not null, department text not null default '',
 role text not null default 'staff' check(role in ('staff','admin')),
 active boolean not null default true, must_change_password boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.kebbi_master(id text primary key, payload jsonb not null);
create table public.kebbi_states(user_id uuid primary key references public.kebbi_members(user_id), revision integer not null default 0, storage jsonb not null default '{}', updated_at timestamptz not null default now());
create table public.kebbi_shared_exports(user_id uuid primary key references public.kebbi_members(user_id), csv text not null, updated_at timestamptz not null default now());
create table public.kebbi_audit(id bigint generated always as identity primary key, actor uuid, action text not null, target text, at timestamptz not null default now());
alter table public.kebbi_members enable row level security;
alter table public.kebbi_master enable row level security;
alter table public.kebbi_states enable row level security;
alter table public.kebbi_shared_exports enable row level security;
alter table public.kebbi_audit enable row level security;
revoke all on public.kebbi_members, public.kebbi_master, public.kebbi_states, public.kebbi_shared_exports, public.kebbi_audit from anon, authenticated;
grant all on public.kebbi_members, public.kebbi_master, public.kebbi_states, public.kebbi_shared_exports, public.kebbi_audit to service_role;
grant usage,select on sequence public.kebbi_audit_id_seq to service_role;
-- No client policies: all access goes through the authenticated API and its active-member check.
create function kebbi_private.only_issued_users() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(new.raw_app_meta_data->>'kebbi_issued','') <> 'true' then
  raise exception 'Dedicated staff accounts only';
 end if;
 return new;
end $$;
revoke all on function kebbi_private.only_issued_users() from public,anon,authenticated;
create trigger kebbi_only_issued before insert on auth.users for each row execute function kebbi_private.only_issued_users();
create function public.kebbi_session_valid(uid uuid, sid uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.kebbi_members m on m.user_id=s.user_id where s.id=sid and s.user_id=uid and m.active and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.kebbi_session_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kebbi_session_valid(uuid,uuid) to service_role;
