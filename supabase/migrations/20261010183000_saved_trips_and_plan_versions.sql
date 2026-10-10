-- Stage 2: run this entire file as one transaction after the foundation migration.
-- The private writer role cannot log in, bypass RLS, or alter/delete history.
begin;
create schema if not exists tripweave_private;
revoke all on schema tripweave_private from public, anon;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tripweave_trip_writer') then
    create role tripweave_trip_writer nologin noinherit nobypassrls;
  end if;
  execute format('grant tripweave_trip_writer to %I', current_user);
end $$;
grant usage on schema public, auth, tripweave_private to tripweave_trip_writer;
grant create on schema tripweave_private to tripweave_trip_writer;
grant usage on schema tripweave_private to authenticated;
grant select(id, email_confirmed_at, is_anonymous) on auth.users to tripweave_trip_writer;
create or replace function tripweave_private.verified_owner(row_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = row_user_id
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    and exists (select 1 from auth.users u where u.id = auth.uid()
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false));
$$;
alter function tripweave_private.verified_owner(uuid) owner to tripweave_trip_writer;
revoke all on function tripweave_private.verified_owner(uuid) from public, anon;
grant execute on function tripweave_private.verified_owner(uuid) to authenticated;
create or replace function public.is_verified_account_owner(row_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select tripweave_private.verified_owner(row_user_id);
$$;
revoke all on function public.is_verified_account_owner(uuid) from public, anon;
grant execute on function public.is_verified_account_owner(uuid) to authenticated, tripweave_trip_writer;
-- 1. Upgrade public.saved_trips non-destructively
do $$
begin
  -- Convert text date columns to native DATE if they were created as text in an earlier draft
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_trips'
      and column_name = 'start_date'
      and data_type <> 'date'
  ) then
    alter table public.saved_trips
      alter column start_date type date
      using case
        when start_date is null or btrim(start_date::text) = '' then null
        when start_date::text ~ '^\d{4}-\d{2}-\d{2}$' then start_date::date
        else start_date::date
      end;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saved_trips'
      and column_name = 'end_date'
      and data_type <> 'date'
  ) then
    alter table public.saved_trips
      alter column end_date type date
      using case
        when end_date is null or btrim(end_date::text) = '' then null
        when end_date::text ~ '^\d{4}-\d{2}-\d{2}$' then end_date::date
        else end_date::date
      end;
  end if;
end $$;

alter table public.saved_trips
  add column if not exists days integer not null default 1 check (days between 1 and 14),
  add column if not exists budget_inr integer not null default 1 check (budget_inr between 1 and 5000000),
  add column if not exists creation_key uuid,
  add column if not exists schema_version integer not null default 1
    check (schema_version >= 1 and schema_version <= 100),
  add column if not exists current_version integer not null default 1
    check (current_version >= 1 and current_version <= 10000),
  add column if not exists selected_variant text not null default 'balanced'
    check (selected_variant in ('budget', 'balanced', 'comfort')),
  add column if not exists request_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_data) = 'object' and pg_column_size(request_data) <= 65536),
  add column if not exists provenance_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance_data) = 'object' and pg_column_size(provenance_data) <= 65536);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'saved_trips_date_order_chk'
      and conrelid = 'public.saved_trips'::regclass
  ) then
    alter table public.saved_trips
      add constraint saved_trips_date_order_chk
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'saved_trips_itinerary_data_bounds_chk'
      and conrelid = 'public.saved_trips'::regclass
  ) then
    alter table public.saved_trips
      add constraint saved_trips_itinerary_data_bounds_chk
      check (jsonb_typeof(itinerary_data) = 'object' and pg_column_size(itinerary_data) <= 524288);
  end if;
end $$;

-- 2. Create public.plan_versions for immutable revision history
create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.saved_trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version_number integer not null check (version_number >= 1 and version_number <= 10000),
  schema_version integer not null default 1 check (schema_version >= 1 and schema_version <= 100),
  change_type text not null default 'initial_save'
    check (change_type in ('initial_save', 'edit', 'rebalance', 'variant_switch', 'restore')),
  change_summary text not null default 'Saved itinerary snapshot'
    check (char_length(trim(change_summary)) between 1 and 280),
  selected_variant text not null default 'balanced'
    check (selected_variant in ('budget', 'balanced', 'comfort')),
  request_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_data) = 'object' and pg_column_size(request_data) <= 65536),
  itinerary_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(itinerary_data) = 'object' and pg_column_size(itinerary_data) <= 524288),
  provenance_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance_data) = 'object' and pg_column_size(provenance_data) <= 65536),
  restored_from_version integer
    check (restored_from_version is null or restored_from_version >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  constraint plan_versions_trip_version_unique unique (trip_id, version_number)
);

create index if not exists idx_plan_versions_trip_version_desc
  on public.plan_versions(trip_id, version_number desc);

create index if not exists idx_plan_versions_user_created_desc
  on public.plan_versions(user_id, created_at desc);

-- Backfill an initial version v1 for any pre-existing saved_trips rows that lack version history
insert into public.plan_versions (
  trip_id,
  user_id,
  version_number,
  schema_version,
  change_type,
  change_summary,
  selected_variant,
  request_data,
  itinerary_data,
  provenance_data,
  created_at
)
select
  st.id,
  st.user_id,
  1,
  st.schema_version,
  'initial_save',
  'Initial saved itinerary snapshot',
  st.selected_variant,
  st.request_data,
  st.itinerary_data,
  st.provenance_data,
  st.created_at
from public.saved_trips st
where not exists (
  select 1 from public.plan_versions pv where pv.trip_id = st.id
);


create unique index if not exists saved_trips_creation_key_unique on public.saved_trips(user_id, creation_key);
create index if not exists saved_trips_owner_updated on public.saved_trips(user_id, updated_at desc);
-- Historical data is preserved. Legacy snapshots without a valid request require explicit repair.
update public.saved_trips set days = end_date - start_date + 1
where start_date is not null and end_date is not null and end_date - start_date between 0 and 13;

update public.saved_trips set budget_inr = (request_data->>'budget_inr')::integer
where case when request_data->>'budget_inr' ~ '^[0-9]{1,7}$'
  then (request_data->>'budget_inr')::integer between 1 and 5000000 else false end;

-- Remove all historical permissive policies, not just policies with our preferred names.
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('saved_trips', 'plan_versions')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
alter table public.saved_trips enable row level security;
alter table public.saved_trips force row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_versions force row level security;
create policy trips_owner on public.saved_trips for all to authenticated, tripweave_trip_writer
  using (public.is_verified_account_owner(user_id)) with check (public.is_verified_account_owner(user_id));
create policy versions_owner on public.plan_versions for all to authenticated, tripweave_trip_writer
  using (public.is_verified_account_owner(user_id) and exists (
    select 1 from public.saved_trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (public.is_verified_account_owner(user_id) and exists (
    select 1 from public.saved_trips t where t.id = trip_id and t.user_id = auth.uid()));
revoke all on public.saved_trips, public.plan_versions from public, anon, authenticated, tripweave_trip_writer;
grant select, delete on public.saved_trips to authenticated;
grant update(title, updated_at) on public.saved_trips to authenticated;
grant select on public.plan_versions to authenticated;
grant select, insert, update on public.saved_trips to tripweave_trip_writer;
grant select, insert on public.plan_versions to tripweave_trip_writer;
-- User identity may not be reassigned. History has no UPDATE/DELETE grant;
-- deleting the parent still deletes its versions through the FK cascade.

-- Drop superseded public signatures so PostgREST cannot select an unsafe overload.
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc
    where pronamespace = 'public'::regnamespace and proname in
      ('restore_trip_version', 'commit_trip_version', 'create_saved_trip_with_version')
  loop execute format('drop function %s', f.signature); end loop;
end $$;

create or replace function tripweave_private.assert_snapshot(req jsonb, snapshot jsonb, selected text, schema_ver integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare variant jsonb; day jsonb; activity jsonb; total bigint; day_total bigint; starts date; ends date; day_index integer; variant_key text; visits integer; pin text; begin
  if octet_length(snapshot::text) > 2097152 or octet_length(req::text) > 65536 then
    raise exception 'Snapshot or request too large' using errcode = '22023'; end if;
  if schema_ver is distinct from 1 or (snapshot->>'schema_version')::integer is distinct from 1
    or jsonb_typeof(req) is distinct from 'object' or jsonb_typeof(snapshot->'variants') is distinct from 'object'
    or not (snapshot->'variants' ? selected) or not exists (select 1 from jsonb_each(snapshot->'variants')) then
    raise exception 'Unsupported or missing snapshot schema' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(req->'locked_activities','[]'::jsonb)) is distinct from 'array'
    or jsonb_array_length(coalesce(req->'locked_activities','[]'::jsonb)) > 15 then
    raise exception 'Invalid pins' using errcode = '22023'; end if;
  starts := (req->>'start_date')::date; ends := (req->>'end_date')::date;
  if starts is null or ends is null or ends - starts not between 0 and 13
    or (req->>'budget_inr')::integer is null or (req->>'budget_inr')::integer not between 1 and 5000000
    or (req->>'people_count')::integer is null or (req->>'people_count')::integer not between 1 and 20
    or lower(req->>'destination') is distinct from lower(snapshot->>'destination')
    or coalesce(req->>'pace', '') not in ('relaxed','balanced','intensive')
    or coalesce(req->>'transport_mode','') not in ('cab','auto','metro','walk') then
    raise exception 'Invalid saved request' using errcode = '22023';
  end if;
  for variant_key, variant in select key, value from jsonb_each(snapshot->'variants') loop
    if variant_key not in ('budget','balanced','comfort') or variant->>'variant_type' is distinct from variant_key
      or coalesce(variant->>'transport_mode','') not in ('cab','auto','metro','walk') then
      raise exception 'Invalid variant' using errcode = '22023'; end if;
    if jsonb_typeof(variant->'days') is distinct from 'array'
      or jsonb_array_length(variant->'days') <> ends - starts + 1
      or variant->'days'->0->>'date' is distinct from starts::text
      or variant->'days'->(ends-starts)->>'date' is distinct from ends::text then
      raise exception 'Snapshot dates do not match request' using errcode = '22023';
    end if;
    total := 0; day_index := 0; visits := 0;
    for day in select value from jsonb_array_elements(variant->'days') loop
      day_index := day_index + 1;
      if day->>'date' is distinct from (starts + day_index - 1)::text or (day->>'day_number')::integer is distinct from day_index then
        raise exception 'Invalid day sequence' using errcode = '22023'; end if;
      if jsonb_typeof(day->'activities') is distinct from 'array' or jsonb_array_length(day->'activities') > 50 then
        raise exception 'Invalid activities' using errcode = '22023'; end if;
      day_total := 0;
      for activity in select value from jsonb_array_elements(day->'activities') loop
        if jsonb_typeof(activity->'estimated_cost_inr') is distinct from 'number'
          or (activity->>'estimated_cost_inr')::bigint < 0 then
          raise exception 'Invalid activity cost' using errcode = '22023'; end if;
        if coalesce(activity->>'place_type','') not in ('rest_break','restaurant') then visits := visits + 1; end if;
        if nullif(btrim(activity->>'place_name'),'') is null or activity->>'start_time' is null or activity->>'end_time' is null
          or (activity->>'lat')::numeric is null or abs((activity->>'lat')::numeric) > 90
          or (activity->>'lng')::numeric is null or abs((activity->>'lng')::numeric) > 180 then
          raise exception 'Invalid activity shape' using errcode = '22023'; end if;
        day_total := day_total + (activity->>'estimated_cost_inr')::bigint;
      end loop;
      if (day->>'day_cost_inr')::bigint is distinct from day_total then
        raise exception 'Day costs do not reconcile' using errcode = '22023'; end if;
      total := total + day_total;
    end loop;
    if visits = 0 or coalesce((variant->'hotel_summary'->>'total_cost_inr')::bigint,0) < 0
      or (variant->>'estimated_transport_cost_inr')::bigint < 0 then
      raise exception 'Invalid route costs or empty sightseeing' using errcode = '22023'; end if;
    total := total + coalesce((variant->'hotel_summary'->>'total_cost_inr')::bigint, 0)
      + (variant->>'estimated_transport_cost_inr')::bigint;
    if total is null or total < 0 or total is distinct from (variant->>'total_cost_inr')::bigint
      or total > (req->>'budget_inr')::integer then
      raise exception 'Snapshot exceeds budget or costs do not reconcile' using errcode = '22023'; end if;
  end loop;
  for pin in select jsonb_array_elements_text(coalesce(req->'locked_activities','[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(snapshot->'variants'->selected->'days') d,
      jsonb_array_elements(d->'activities') a where lower(a->>'place_id')=lower(pin) or lower(a->>'place_name')=lower(pin)) then
      raise exception 'Mandatory stop missing from selected itinerary' using errcode = '22023'; end if;
  end loop;
end $$;
-- 4a. Create a saved trip and its initial v1 version atomically
create or replace function tripweave_private.create_saved_trip_with_version(
  p_title text,
  p_creation_key uuid,
  p_destination text,
  p_days integer,
  p_budget_inr integer,
  p_start_date date default null,
  p_end_date date default null,
  p_selected_variant text default 'balanced',
  p_request_data jsonb default '{}'::jsonb,
  p_itinerary_data jsonb default '{}'::jsonb,
  p_provenance_data jsonb default '{}'::jsonb,
  p_schema_version integer default 1
)
returns public.saved_trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_trip public.saved_trips;
begin
  if v_owner is null or not public.is_verified_account_owner(v_owner) then
    raise exception 'Verified account required to save trips'
      using errcode = '42501';
  end if;

  if p_creation_key is null then raise exception 'Creation key required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || p_creation_key::text, 0));
  select * into v_trip from public.saved_trips where user_id = v_owner and creation_key = p_creation_key;
  if found then
    if v_trip.request_data is distinct from p_request_data or v_trip.itinerary_data is distinct from p_itinerary_data then
      raise exception 'Creation key already used for a different snapshot' using errcode = '23505'; end if;
    return v_trip;
  end if;
  perform tripweave_private.assert_snapshot(p_request_data, p_itinerary_data, p_selected_variant, p_schema_version);
  if lower(p_destination) is distinct from lower(p_itinerary_data->>'destination') then
    raise exception 'Destination metadata mismatch' using errcode = '22023'; end if;
  if p_days is distinct from (p_end_date - p_start_date + 1)
    or p_budget_inr is distinct from (p_request_data->>'budget_inr')::integer
    or p_start_date is distinct from (p_request_data->>'start_date')::date
    or p_end_date is distinct from (p_request_data->>'end_date')::date then
    raise exception 'Saved metadata does not match request' using errcode = '22023'; end if;
  insert into public.saved_trips (
    user_id,
    creation_key,
    group_size,
    pace,
    title,
    destination,
    days,
    budget_inr,
    start_date,
    end_date,
    selected_variant,
    request_data,
    itinerary_data,
    provenance_data,
    schema_version,
    current_version
  ) values (
    v_owner,
    p_creation_key,
    (p_request_data->>'people_count')::integer,
    p_request_data->>'pace',
    btrim(p_title),
    btrim(p_destination),
    p_days,
    p_budget_inr,
    p_start_date,
    p_end_date,
    p_selected_variant,
    coalesce(p_request_data, '{}'::jsonb),
    coalesce(p_itinerary_data, '{}'::jsonb),
    coalesce(p_provenance_data, '{}'::jsonb),
    coalesce(p_schema_version, 1),
    1
  )
  returning * into v_trip;

  insert into public.plan_versions (
    trip_id,
    user_id,
    version_number,
    schema_version,
    change_type,
    change_summary,
    selected_variant,
    request_data,
    itinerary_data,
    provenance_data
  ) values (
    v_trip.id,
    v_owner,
    1,
    v_trip.schema_version,
    'initial_save',
    'Initial saved itinerary snapshot',
    v_trip.selected_variant,
    v_trip.request_data,
    v_trip.itinerary_data,
    v_trip.provenance_data
  );

  return v_trip;
end;
$$;

-- 4b. Atomically commit a new version with optimistic concurrency protection
create or replace function tripweave_private.commit_trip_version(
  p_trip_id uuid,
  p_expected_version integer,
  p_change_type text,
  p_change_summary text,
  p_selected_variant text,
  p_itinerary_data jsonb,
  p_request_data jsonb,
  p_provenance_data jsonb default null,
  p_schema_version integer default 1,
  p_restored_from_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_trip public.saved_trips;
  v_version public.plan_versions;
  v_next_version integer;
begin
  if v_owner is null or not public.is_verified_account_owner(v_owner) then
    raise exception 'Verified account required to modify trips'
      using errcode = '42501';
  end if;

  select *
  into v_trip
  from public.saved_trips
  where id = p_trip_id
    and user_id = v_owner
  for update;

  if not found then
    raise exception 'Saved trip not found or access denied'
      using errcode = 'P0002';
  end if;

  if p_expected_version is null or p_expected_version < 1 or v_trip.current_version <> p_expected_version then
    raise exception 'CONCURRENCY_CONFLICT: Expected version %, but trip is currently at version %',
      p_expected_version, v_trip.current_version
      using errcode = '40001';
  end if;

  perform tripweave_private.assert_snapshot(p_request_data, p_itinerary_data, p_selected_variant, p_schema_version);
  v_next_version := v_trip.current_version + 1;

  insert into public.plan_versions (
    trip_id,
    user_id,
    version_number,
    schema_version,
    change_type,
    change_summary,
    selected_variant,
    request_data,
    itinerary_data,
    provenance_data,
    restored_from_version
  ) values (
    v_trip.id,
    v_owner,
    v_next_version,
    coalesce(p_schema_version, v_trip.schema_version, 1),
    p_change_type,
    btrim(p_change_summary),
    coalesce(p_selected_variant, v_trip.selected_variant, 'balanced'),
    p_request_data,
    p_itinerary_data,
    coalesce(p_provenance_data, v_trip.provenance_data, '{}'::jsonb),
    p_restored_from_version
  )
  returning * into v_version;

  update public.saved_trips
  set
    current_version = v_next_version,
    request_data = v_version.request_data,
    destination = v_version.itinerary_data->>'destination',
    start_date = (v_version.request_data->>'start_date')::date,
    end_date = (v_version.request_data->>'end_date')::date,
    days = (v_version.request_data->>'end_date')::date - (v_version.request_data->>'start_date')::date + 1,
    budget_inr = (v_version.request_data->>'budget_inr')::integer,
    group_size = (v_version.request_data->>'people_count')::integer,
    pace = v_version.request_data->>'pace',
    selected_variant = v_version.selected_variant,
    itinerary_data = v_version.itinerary_data,
    provenance_data = v_version.provenance_data,
    schema_version = v_version.schema_version,
    updated_at = timezone('utc', now())
  where id = v_trip.id
  returning * into v_trip;

  return jsonb_build_object(
    'trip', to_jsonb(v_trip),
    'version', to_jsonb(v_version)
  );
end;
$$;

-- 4c. Atomically restore an earlier version as a new version (preserving history)
create or replace function tripweave_private.restore_trip_version(
  p_trip_id uuid,
  p_target_version_number integer,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_target public.plan_versions;
begin
  if v_owner is null or not public.is_verified_account_owner(v_owner) then
    raise exception 'Verified account required to restore trip versions'
      using errcode = '42501';
  end if;

  select *
  into v_target
  from public.plan_versions
  where trip_id = p_trip_id
    and version_number = p_target_version_number
    and user_id = v_owner;

  if not found then
    raise exception 'Target version v% not found for this trip', p_target_version_number
      using errcode = 'P0002';
  end if;

  return tripweave_private.commit_trip_version(
    p_trip_id => p_trip_id,
    p_expected_version => p_expected_version,
    p_change_type => 'restore',
    p_change_summary => left(format('Restored from version v%s (%s)', v_target.version_number, v_target.change_summary), 280),
    p_selected_variant => v_target.selected_variant,
    p_request_data => v_target.request_data,
    p_itinerary_data => v_target.itinerary_data,
    p_provenance_data => v_target.provenance_data,
    p_schema_version => v_target.schema_version,
    p_restored_from_version => v_target.version_number
  );
end;
$$;


-- Public RPCs run as the caller. Only the narrowly privileged private implementations
-- elevate to the NOLOGIN writer; that role remains subject to both ownership policies.
alter function tripweave_private.create_saved_trip_with_version(text, uuid, text, integer, integer, date, date, text, jsonb, jsonb, jsonb, integer) owner to tripweave_trip_writer;
revoke all on function tripweave_private.create_saved_trip_with_version(text, uuid, text, integer, integer, date, date, text, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function tripweave_private.create_saved_trip_with_version(text, uuid, text, integer, integer, date, date, text, jsonb, jsonb, jsonb, integer) to authenticated;
create or replace function public.create_saved_trip_with_version(
  p_title text,
  p_creation_key uuid,
  p_destination text,
  p_days integer,
  p_budget_inr integer,
  p_start_date date default null,
  p_end_date date default null,
  p_selected_variant text default 'balanced',
  p_request_data jsonb default '{}'::jsonb,
  p_itinerary_data jsonb default '{}'::jsonb,
  p_provenance_data jsonb default '{}'::jsonb,
  p_schema_version integer default 1
)
returns public.saved_trips language sql security invoker set search_path = '' as $$
  select tripweave_private.create_saved_trip_with_version(p_title, p_creation_key, p_destination, p_days, p_budget_inr, p_start_date, p_end_date, p_selected_variant, p_request_data, p_itinerary_data, p_provenance_data, p_schema_version);
$$;
revoke all on function public.create_saved_trip_with_version(text, uuid, text, integer, integer, date, date, text, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.create_saved_trip_with_version(text, uuid, text, integer, integer, date, date, text, jsonb, jsonb, jsonb, integer) to authenticated;
alter function tripweave_private.commit_trip_version(uuid, integer, text, text, text, jsonb, jsonb, jsonb, integer, integer) owner to tripweave_trip_writer;
revoke all on function tripweave_private.commit_trip_version(uuid, integer, text, text, text, jsonb, jsonb, jsonb, integer, integer) from public, anon;
grant execute on function tripweave_private.commit_trip_version(uuid, integer, text, text, text, jsonb, jsonb, jsonb, integer, integer) to authenticated;
create or replace function public.commit_trip_version(
  p_trip_id uuid,
  p_expected_version integer,
  p_change_type text,
  p_change_summary text,
  p_selected_variant text,
  p_itinerary_data jsonb,
  p_request_data jsonb,
  p_provenance_data jsonb default null,
  p_schema_version integer default 1,
  p_restored_from_version integer default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select tripweave_private.commit_trip_version(p_trip_id, p_expected_version, p_change_type, p_change_summary, p_selected_variant, p_itinerary_data, p_request_data, p_provenance_data, p_schema_version, p_restored_from_version);
$$;
revoke all on function public.commit_trip_version(uuid, integer, text, text, text, jsonb, jsonb, jsonb, integer, integer) from public, anon;
grant execute on function public.commit_trip_version(uuid, integer, text, text, text, jsonb, jsonb, jsonb, integer, integer) to authenticated;
alter function tripweave_private.restore_trip_version(uuid, integer, integer) owner to tripweave_trip_writer;
revoke all on function tripweave_private.restore_trip_version(uuid, integer, integer) from public, anon;
grant execute on function tripweave_private.restore_trip_version(uuid, integer, integer) to authenticated;
create or replace function public.restore_trip_version(
  p_trip_id uuid,
  p_target_version_number integer,
  p_expected_version integer
)
returns jsonb language sql security invoker set search_path = '' as $$
  select tripweave_private.restore_trip_version(p_trip_id, p_target_version_number, p_expected_version);
$$;
revoke all on function public.restore_trip_version(uuid, integer, integer) from public, anon;
grant execute on function public.restore_trip_version(uuid, integer, integer) to authenticated;
alter function tripweave_private.assert_snapshot(jsonb, jsonb, text, integer) owner to tripweave_trip_writer;
revoke all on function tripweave_private.assert_snapshot(jsonb, jsonb, text, integer) from public, anon, authenticated;
notify pgrst, 'reload schema';
revoke create on schema tripweave_private from tripweave_trip_writer;
commit;
