-- auth.users remains the authority for email, providers, and credentials.
-- This migration supports a fresh project and the earlier schema.sql prototype.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  name text check (char_length(name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remove the prototype's privileged metadata trigger. Profile writes are optional
-- and use the caller's own authenticated role instead of bypassing RLS.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create table if not exists public.saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 160),
  destination text not null check (char_length(destination) between 1 and 100),
  start_date text,
  end_date text,
  group_size integer not null default 1 check (group_size between 1 and 50),
  budget_tier text default 'moderate',
  pace text default 'balanced',
  itinerary_data jsonb not null default '{}'::jsonb,
  expenses_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_trips_user_id on public.saved_trips(user_id);
alter table public.profiles enable row level security;
alter table public.saved_trips enable row level security;
revoke all on public.profiles, public.saved_trips from anon, authenticated;
grant select, insert, update, delete on public.saved_trips to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- Replace prior policies, including policies that accidentally grant public access.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'saved_trips')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy profiles_owner on public.profiles for all to authenticated
  using ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy trips_owner on public.saved_trips for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

-- Old email/provider columns, if present, are display-only legacy data.
-- They are never used to authorize access; auth.users is authoritative.
comment on table public.profiles is 'Optional display profile. Auth users supply authoritative identity.';
comment on table public.saved_trips is 'Private per-user storage; public share links require a separate explicit sharing model.';
commit;
