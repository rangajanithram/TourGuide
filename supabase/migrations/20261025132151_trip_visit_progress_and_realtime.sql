-- Shared completion marks are separate from private requests and financial records.
begin;
create table public.trip_stop_visits (
 trip_id uuid not null references public.saved_trips(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 stop_key text not null check (stop_key ~ '^[0-9a-f]{64}$'),
 visited boolean not null,
 revision integer not null default 1 check (revision > 0),
 changed_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(trip_id,stop_key)
);
create index trip_stop_visits_owner on public.trip_stop_visits(user_id);
create index trip_stop_visits_actor on public.trip_stop_visits(changed_by);
alter table public.trip_stop_visits enable row level security;
revoke all on public.trip_stop_visits from public,anon,authenticated;
create policy trip_visits_read on public.trip_stop_visits for select to authenticated using (
 public.is_verified_account_owner(user_id) or tripweave_private.can_read_room(trip_id)
);
grant select on public.trip_stop_visits to authenticated;

-- A stable identity survives time changes, but never transfers completion to a
-- different venue or date. Callers cannot supply identities for arbitrary stops.
create function tripweave_private.visit_stops(t public.saved_trips) returns table(stop_key text,day integer,stop_index integer)
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(
  coalesce(nullif(d.value->>'date',''),d.value->>'day_number'),
  coalesce(nullif(a.value->>'meal_venue_id',''),nullif(a.value->>'place_id',''),a.value->>'place_name'),
  coalesce(a.value->>'meal_type',''),coalesce(a.value->>'place_type','')
 )::text,'UTF8')),'hex'),(d.value->>'day_number')::integer,(a.ordinality-1)::integer
 from jsonb_array_elements(t.itinerary_data->'variants'->t.selected_variant->'days') d(value),
 lateral jsonb_array_elements(d.value->'activities') with ordinality a(value,ordinality);
$$;
revoke all on function tripweave_private.visit_stops(public.saved_trips) from public,anon,authenticated;

create function tripweave_private.visit_command(p_trip_id uuid,p_action text,p_data jsonb,p_plan_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); t public.saved_trips; old public.trip_stop_visits; wanted boolean; key text;
begin
 if not public.is_verified_account_owner(actor) then
  raise exception 'Sign in with a verified account to use shared visit checks.' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('read','set') or p_data is null or
  jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>1024 then
  raise exception 'Invalid visit check request.' using errcode='22023';
 end if;
 -- Authorize before locking. Private trip fields never leave this function.
 select * into t from public.saved_trips where id=p_trip_id;
 if not found or not (t.user_id=actor or tripweave_private.can_read_room(p_trip_id)) then
  raise exception 'This trip is unavailable or you no longer have access.' using errcode='42501';
 end if;
 if p_action='set' then
  select * into t from public.saved_trips where id=p_trip_id for update;
  if not found or not (t.user_id=actor or tripweave_private.can_read_room(p_trip_id)) then
   raise exception 'This trip is unavailable or you no longer have access.' using errcode='42501';
  end if;
  if p_plan_version is distinct from t.current_version then
   raise exception 'The saved itinerary changed. Load the latest trip before marking a stop.' using errcode='40001';
  end if;
  key:=p_data->>'key';
  if key is null or not exists(select 1 from tripweave_private.visit_stops(t) s where s.stop_key=key)
   or jsonb_typeof(p_data->'visited') is distinct from 'boolean'
   or coalesce(p_data->>'revision','') !~ '^[0-9]{1,9}$' then
   raise exception 'Choose a stop from the current saved itinerary.' using errcode='22023';
  end if;
  wanted:=(p_data->>'visited')::boolean;
  select * into old from public.trip_stop_visits v where v.trip_id=p_trip_id and v.stop_key=key;
  -- A retry of the same explicit state is safe; a stale opposite change is not.
  if old.visited is distinct from wanted then
   if (p_data->>'revision')::integer<>coalesce(old.revision,0) then
    raise exception 'Someone changed this visit check. Review the latest state and try again.' using errcode='40001';
   end if;
   insert into public.trip_stop_visits(trip_id,user_id,stop_key,visited,changed_by)
   values(t.id,t.user_id,key,wanted,actor)
   on conflict(trip_id,stop_key) do update set visited=excluded.visited,
    changed_by=excluded.changed_by,revision=public.trip_stop_visits.revision+1,updated_at=now();
  end if;
 end if;
 return jsonb_build_object('trip_id',t.id,'plan_version',t.current_version,'variant',t.selected_variant,
  'stops',coalesce((select jsonb_agg(jsonb_build_object('key',s.stop_key,'day',s.day,'index',s.stop_index,
    'visited',coalesce(v.visited,false),'revision',coalesce(v.revision,0),'updated_at',v.updated_at)
    order by s.day,s.stop_index)
   from tripweave_private.visit_stops(t) s left join public.trip_stop_visits v
    on v.trip_id=t.id and v.stop_key=s.stop_key),'[]'::jsonb));
end $$;
revoke all on function tripweave_private.visit_command(uuid,text,jsonb,integer) from public,anon;
grant execute on function tripweave_private.visit_command(uuid,text,jsonb,integer) to authenticated;
create function public.trip_visit_command(p_trip_id uuid,p_action text,p_data jsonb default '{}',p_plan_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select tripweave_private.visit_command(p_trip_id,p_action,p_data,p_plan_version);
$$;
revoke all on function public.trip_visit_command(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.trip_visit_command(uuid,text,jsonb,integer) to authenticated;

-- Realtime clients subscribe only to INSERT/UPDATE, scoped by trip ID. RLS
-- controls delivery; payloads are invalidations, followed by an authorized read.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='trip_rooms') then
  alter publication supabase_realtime add table public.trip_rooms;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='trip_stop_visits') then
  alter publication supabase_realtime add table public.trip_stop_visits;
 end if;
end $$;
commit;
