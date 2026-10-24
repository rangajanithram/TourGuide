-- Shared rooms keep private saved-trip requests/history owner-only.
-- All writes use checked RPCs; no service key is needed by the browser.
begin;
create table public.trip_rooms (
 trip_id uuid primary key references public.saved_trips(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 include_stay boolean not null default false,
 plan_data jsonb not null,
 plan_version integer not null,
 ledger jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create index trip_rooms_owner on public.trip_rooms(user_id);
create table public.trip_room_members (
 trip_id uuid not null references public.trip_rooms(trip_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 80),
 joined_at timestamptz not null default now(),
 primary key(trip_id,user_id)
);
create index trip_room_members_user on public.trip_room_members(user_id,trip_id);
create table tripweave_private.room_invites (
 trip_id uuid primary key references public.trip_rooms(trip_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 token_hash bytea not null,
 expires_at timestamptz not null
);
create table public.trip_room_events (
 id bigint generated always as identity primary key,
 trip_id uuid not null references public.trip_rooms(trip_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null,
 created_at timestamptz not null default now()
);
create index trip_room_events_user on public.trip_room_events(user_id);
create index room_invites_owner on tripweave_private.room_invites(user_id);
create index trip_room_events_trip on public.trip_room_events(trip_id,created_at desc);
alter table public.trip_rooms enable row level security;
alter table public.trip_room_members enable row level security;
alter table public.trip_room_events enable row level security;
alter table tripweave_private.room_invites enable row level security;
revoke all on public.trip_rooms,public.trip_room_members,public.trip_room_events,tripweave_private.room_invites from public,anon,authenticated;

-- Narrow membership lookup avoids recursive RLS; verified identity is checked from auth.users.
create function tripweave_private.can_read_room(t uuid) returns boolean language sql stable
security definer set search_path='' as $$
 select public.is_verified_account_owner(auth.uid()) and exists(
 select 1 from public.trip_rooms r where r.trip_id=t and
 (r.user_id=auth.uid() or (r.enabled and exists(select 1 from public.trip_room_members m where m.trip_id=t and m.user_id=auth.uid()))));
$$;
revoke all on function tripweave_private.can_read_room(uuid) from public,anon;
grant execute on function tripweave_private.can_read_room(uuid) to authenticated;
create policy room_member_read on public.trip_rooms for select to authenticated using (tripweave_private.can_read_room(trip_id));
create policy room_roster_read on public.trip_room_members for select to authenticated using (tripweave_private.can_read_room(trip_id));
create policy room_events_read on public.trip_room_events for select to authenticated using (tripweave_private.can_read_room(trip_id));
grant select on public.trip_rooms,public.trip_room_members,public.trip_room_events to authenticated;

-- Construct only shareable itinerary fields. Private request_data, trip IDs, accounts and history are omitted.
create function tripweave_private.room_plan(t public.saved_trips, with_stay boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p jsonb; d jsonb; a jsonb; ds jsonb='[]'; acts jsonb; s jsonb; result jsonb;
begin
 p:=t.itinerary_data->'variants'->t.selected_variant;
 for d in select value from jsonb_array_elements(p->'days') loop
  acts:='[]';
  for a in select value from jsonb_array_elements(d->'activities') loop
   s:=jsonb_build_object('name',left(a->>'place_name',200),'start',a->>'start_time','end',a->>'end_time',
    'cost',coalesce((a->>'estimated_cost_inr')::numeric,0),'type',left(coalesce(nullif(a->>'meal_type','')||' · ','')||coalesce(a->>'place_type','visit'),80),'source',left(coalesce(a->>'source_reference',''),500));
   if a->>'lat' is not null and a->>'lng' is not null and coalesce(a->>'place_type','')<>'rest_break'
    and not (coalesce(a->>'meal_type','')<>'' and coalesce(a->>'meal_venue_id','')='') then
     s:=s||jsonb_build_object('lat',(a->>'lat')::numeric,'lng',(a->>'lng')::numeric);
   end if;
   if a->>'rating' is not null and coalesce(a->>'rating_evidence','')<>'' then
    s:=s||jsonb_build_object('rating',(a->>'rating')::numeric,'ratingNote',left(a->>'rating_evidence',400));
   end if;
   acts:=acts||jsonb_build_array(s);
  end loop;
  s:=jsonb_build_object('number',(d->>'day_number')::int,'date',coalesce(d->>'date',''),'area',left(coalesce(d->>'cluster_name',''),200),'note',left(coalesce(d->>'planning_note',''),600),'stops',acts);
  if jsonb_typeof(d->'weather')='object' then
   s:=s||jsonb_build_object('weather',jsonb_build_object('condition',left(d->'weather'->>'condition',120),'temperature',d->'weather'->'max_temp_c','rain',d->'weather'->'precipitation_probability_pct','forecast',d->'weather'->'is_forecast'));
  end if;
  ds:=ds||jsonb_build_array(s);
 end loop;
 result:=jsonb_build_object('version',1,'city',left(t.destination,80),'title',left(t.title,180),'createdAt',t.updated_at,
 'people',coalesce((t.request_data->>'people_count')::int,1),'mode',p->>'transport_mode','variant',t.selected_variant,
 'total',(p->>'total_cost_inr')::numeric,'localTravel',coalesce((p->>'estimated_transport_cost_inr')::numeric,0),'days',ds);
 if with_stay and jsonb_typeof(p->'hotel_summary')='object' then
  result:=result||jsonb_build_object('stay',jsonb_build_object('name',left(p->'hotel_summary'->>'hotel_name',200),'cost',p->'hotel_summary'->'total_cost_inr','nights',p->'hotel_summary'->'nights','address',left(coalesce(p->'hotel_summary'->>'formatted_address',''),400)));
 end if;
 return result;
end $$;
revoke all on function tripweave_private.room_plan(public.saved_trips,boolean) from public,anon,authenticated;

create function tripweave_private.sync_saved_room() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.trip_rooms set plan_data=tripweave_private.room_plan(new,include_stay),plan_version=new.current_version,revision=revision+1,updated_at=now() where trip_id=new.id;
 return new;
end $$;
revoke all on function tripweave_private.sync_saved_room() from public,anon,authenticated;
create trigger sync_saved_room after update of itinerary_data,request_data,selected_variant,title,current_version on public.saved_trips for each row execute function tripweave_private.sync_saved_room();

create function tripweave_private.check_room_bill(b jsonb, people jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare s jsonb; total numeric=0; n numeric;
begin
 if jsonb_typeof(b)<>'object' or length(btrim(coalesce(b->>'title',''))) not between 1 and 160 or
 coalesce(b->>'category','') not in ('dining','transit','lodging','activities','shopping','other') or
 coalesce(b->>'split_type','') not in ('equal','custom') or jsonb_typeof(b->'splits')<>'array' or
 not exists(select 1 from jsonb_array_elements(people) x where x->>'id'=b->>'paid_by_member_id') then
 raise exception 'Check the bill name, payer and shares.' using errcode='22023'; end if;
 n:=(b->>'amount_inr')::numeric;
 if n is null or n<=0 or n>5000000 or n<>round(n,2) or jsonb_array_length(b->'splits') not between 1 and 50 or
 length(coalesce(b->>'notes',''))>500 or (select count(distinct x->>'member_id') from jsonb_array_elements(b->'splits') x)<>jsonb_array_length(b->'splits') then
 raise exception 'Enter a valid bill total and one share per person.' using errcode='22023'; end if;
 for s in select value from jsonb_array_elements(b->'splits') loop
  if not exists(select 1 from jsonb_array_elements(people) x where x->>'id'=s->>'member_id') or
  (s->>'amount_inr')::numeric is null or (s->>'amount_inr')::numeric<0 or (s->>'amount_inr')::numeric<>round((s->>'amount_inr')::numeric,2) then
   raise exception 'Check each person and their share.' using errcode='22023'; end if;
  total:=total+(s->>'amount_inr')::numeric;
 end loop;
 if total<>n then raise exception 'Shares must add up to the bill total.' using errcode='22023'; end if;
end $$;
revoke all on function tripweave_private.check_room_bill(jsonb,jsonb) from public,anon,authenticated;

-- Command boundary: the actor always comes from the verified session, never JSON.
-- A locked room row plus expected revision prevents silent overwrite and lost updates.
create function tripweave_private.room_command(p_trip_id uuid,p_action text,p_data jsonb,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); r public.trip_rooms; t public.saved_trips; l jsonb; item jsonb; target text; n numeric; net_from numeric=0; net_to numeric=0; token text; nm text; host boolean; mine boolean;
begin
 if not public.is_verified_account_owner(actor) then raise exception 'Sign in with a verified account to use a trip room.' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>100000 then raise exception 'Invalid room request.' using errcode='22023'; end if;
 if p_action='create' then
  select * into t from public.saved_trips where id=p_trip_id and user_id=actor for update;
  if not found then raise exception 'Save this trip to your account first.' using errcode='P0002'; end if;
  nm:=btrim(coalesce(p_data->>'name','Traveler')); if length(nm) not between 1 and 80 then raise exception 'Enter your name.' using errcode='22023'; end if;
  insert into public.trip_rooms(trip_id,user_id,plan_data,plan_version,ledger) values(t.id,actor,tripweave_private.room_plan(t,false),t.current_version,jsonb_build_object('members',jsonb_build_array(jsonb_build_object('id',actor::text,'name',nm)),'expenses','[]'::jsonb,'settlements','[]'::jsonb)) on conflict(trip_id) do nothing;
  insert into public.trip_room_members(trip_id,user_id,name) values(t.id,actor,nm) on conflict do nothing;
 end if;
 select * into r from public.trip_rooms where trip_id=p_trip_id for update;
 if not found then raise exception 'This trip room is unavailable or you do not have access.' using errcode='P0002'; end if;
 host:=r.user_id=actor;
 mine:=exists(select 1 from public.trip_room_members where trip_id=p_trip_id and user_id=actor);
 if p_action='join' then
  if not r.enabled or length(coalesce(p_data->>'token',''))<>64 or not exists(select 1 from tripweave_private.room_invites where trip_id=p_trip_id and token_hash=sha256(convert_to(p_data->>'token','UTF8')) and expires_at>now()) then
   raise exception 'This invitation has expired or was replaced. Ask the owner for a new one.' using errcode='42501'; end if;
  nm:=btrim(coalesce(p_data->>'name','')); if length(nm) not between 1 and 80 then raise exception 'Enter your name, up to 80 characters.' using errcode='22023'; end if;
  if not mine then
   if jsonb_array_length(r.ledger->'members')>=50 then raise exception 'This room has reached 50 people.' using errcode='22023'; end if;
   insert into public.trip_room_members(trip_id,user_id,name) values(p_trip_id,actor,nm);
   if not exists(select 1 from jsonb_array_elements(r.ledger->'members') m where m->>'id'=actor::text) then
    r.ledger:=jsonb_set(r.ledger,'{members}',r.ledger->'members'||jsonb_build_array(jsonb_build_object('id',actor::text,'name',nm)));
   end if;
   update public.trip_rooms set ledger=r.ledger,revision=revision+1,updated_at=now() where trip_id=p_trip_id returning * into r;
  end if;
  mine:=true;
 end if;
 if not (host or (r.enabled and mine)) then raise exception 'This trip room is unavailable or you do not have access.' using errcode='42501'; end if;
 if p_action in ('read','create','join') then null;
 elsif p_action='invite' then
  if not host or not r.enabled then raise exception 'Only the owner can invite people to an open room.' using errcode='42501'; end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into tripweave_private.room_invites values(p_trip_id,actor,sha256(convert_to(token,'UTF8')),now()+interval '7 days') on conflict(trip_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('token',token,'expires_at',now()+interval '7 days');
 elsif p_action='revoke_invite' then
  if not host then raise exception 'Only the owner can replace invitations.' using errcode='42501'; end if;
  delete from tripweave_private.room_invites where trip_id=p_trip_id;
 elsif p_action='remove_member' then
  if not host or p_data->>'user_id'=actor::text then raise exception 'Only the owner can remove another member.' using errcode='42501'; end if;
  delete from public.trip_room_members where trip_id=p_trip_id and user_id=(p_data->>'user_id')::uuid;
  delete from tripweave_private.room_invites where trip_id=p_trip_id;
  update public.trip_rooms set revision=revision+1,updated_at=now() where trip_id=p_trip_id returning * into r;
 elsif p_action='settings' then
  if not host then raise exception 'Only the owner can change sharing settings.' using errcode='42501'; end if;
  select * into t from public.saved_trips where id=p_trip_id;
  update public.trip_rooms set enabled=coalesce((p_data->>'enabled')::boolean,enabled),include_stay=coalesce((p_data->>'include_stay')::boolean,include_stay),plan_data=tripweave_private.room_plan(t,coalesce((p_data->>'include_stay')::boolean,include_stay)),revision=revision+1,updated_at=now() where trip_id=p_trip_id returning * into r;
  if not r.enabled then delete from tripweave_private.room_invites where trip_id=p_trip_id; end if;
 else
  if not r.enabled then raise exception 'Reopen the room before adding bills.' using errcode='42501'; end if;
  -- An acknowledged or timed-out retry of the same bill is safe even after a newer revision.
  if p_action='add_bill' then
   select value into item from jsonb_array_elements(r.ledger->'expenses') where value->>'id'=p_data->>'id';
   if item is not null then
    if item->>'created_by'=actor::text and item->>'title'=btrim(p_data->>'title') and
       (item->>'amount_inr')::numeric=(p_data->>'amount_inr')::numeric and item->>'category'=p_data->>'category' and
       item->>'paid_by_member_id'=p_data->>'paid_by_member_id' and item->>'split_type'=p_data->>'split_type' and
       item->'splits'=p_data->'splits' and coalesce(item->>'notes','')=coalesce(p_data->>'notes','') then
     return to_jsonb(r)||jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.name,'joined_at',m.joined_at) order by m.joined_at),'[]') from public.trip_room_members m where m.trip_id=p_trip_id));
    end if;
    raise exception 'This bill was already saved with different details. Review the saved bills before adding another.' using errcode='23505';
   end if;
  end if;
  if p_expected_version is distinct from r.revision then raise exception 'Someone updated the room. Latest data loaded; review and try again.' using errcode='40001'; end if;
  l:=r.ledger;
  if p_action='add_bill' then
   perform tripweave_private.check_room_bill(p_data,l->'members');
   if not host and p_data->>'paid_by_member_id'<>actor::text then raise exception 'You can record your own payments. Ask the owner to record someone else’s bill.' using errcode='42501'; end if;
   if jsonb_array_length(l->'expenses')>=1000 then raise exception 'This room has reached 1,000 bills.' using errcode='22023'; end if;
   -- An idempotency ID prevents a network retry from duplicating a bill.
   target:=(p_data->>'id')::uuid::text; if target is null then raise exception 'Missing bill identifier.' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(l->'expenses') x where x->>'id'=target) then raise exception 'This bill is already saved. Refresh the list.' using errcode='23505'; end if;
   item:=jsonb_build_object('id',target,'title',btrim(p_data->>'title'),'amount_inr',(p_data->>'amount_inr')::numeric,'category',p_data->>'category','paid_by_member_id',p_data->>'paid_by_member_id','split_type',p_data->>'split_type','splits',p_data->'splits','created_at',now(),'created_by',actor::text,'notes',nullif(p_data->>'notes',''));
   l:=jsonb_set(l,'{expenses}',jsonb_build_array(item)||(l->'expenses'));
  elsif p_action='delete_bill' then
   select value into item from jsonb_array_elements(l->'expenses') where value->>'id'=p_data->>'id';
   if item is null or (not host and (item->>'created_by') is distinct from actor::text) then raise exception 'Only the person who added this bill or the owner can delete it.' using errcode='42501'; end if;
   l:=jsonb_set(l,'{expenses}',coalesce((select jsonb_agg(x) from jsonb_array_elements(l->'expenses') x where x->>'id'<>p_data->>'id'),'[]'));
  elsif p_action='add_person' then
   nm:=btrim(coalesce(p_data->>'name',''));
   if not host then raise exception 'Only the owner can add a person without an account.' using errcode='42501'; end if;
   if length(nm) not between 1 and 80 or jsonb_array_length(l->'members')>=50 then raise exception 'Enter a name; rooms can have up to 50 people.' using errcode='22023'; end if;
   l:=jsonb_set(l,'{members}',l->'members'||jsonb_build_array(jsonb_build_object('id','guest_'||gen_random_uuid()::text,'name',nm)));
  elsif p_action='rename_person' then
   target:=p_data->>'id'; nm:=btrim(coalesce(p_data->>'name',''));
   if (not host and target<>actor::text) or length(nm) not between 1 and 80 then raise exception 'You can change your own display name; the owner manages other names.' using errcode='42501'; end if;
   l:=jsonb_set(l,'{members}',(select jsonb_agg(case when x->>'id'=target then x||jsonb_build_object('name',nm) else x end) from jsonb_array_elements(l->'members') x));
   update public.trip_room_members set name=nm where trip_id=p_trip_id and user_id::text=target;
  elsif p_action='record_payment' then
   target:=p_data->>'to_member_id'; n:=(p_data->>'amount_inr')::numeric;
   if coalesce(p_data->>'confirm_received','')<>'true' or (not host and target<>actor::text) then raise exception 'Only the recipient or owner can explicitly confirm receipt.' using errcode='42501'; end if;
   if n is null or n<=0 or n<>round(n,2) or n>5000000000 or target=p_data->>'from_member_id' or not exists(select 1 from jsonb_array_elements(l->'members') x where x->>'id'=target) or not exists(select 1 from jsonb_array_elements(l->'members') x where x->>'id'=p_data->>'from_member_id') then raise exception 'Check the payment details.' using errcode='22023'; end if;
   if jsonb_array_length(l->'settlements')>=1000 then raise exception 'Payment record limit reached.' using errcode='22023'; end if;
   for item in select value from jsonb_array_elements(l->'expenses') loop
    net_from:=net_from+case when item->>'paid_by_member_id'=p_data->>'from_member_id' then (item->>'amount_inr')::numeric else 0 end-coalesce((select sum((x->>'amount_inr')::numeric) from jsonb_array_elements(item->'splits') x where x->>'member_id'=p_data->>'from_member_id'),0);
    net_to:=net_to+case when item->>'paid_by_member_id'=target then (item->>'amount_inr')::numeric else 0 end-coalesce((select sum((x->>'amount_inr')::numeric) from jsonb_array_elements(item->'splits') x where x->>'member_id'=target),0);
   end loop;
   for item in select value from jsonb_array_elements(l->'settlements') loop
    net_from:=net_from+case when item->>'from_member_id'=p_data->>'from_member_id' then (item->>'amount_inr')::numeric when item->>'to_member_id'=p_data->>'from_member_id' then -(item->>'amount_inr')::numeric else 0 end;
    net_to:=net_to+case when item->>'from_member_id'=target then (item->>'amount_inr')::numeric when item->>'to_member_id'=target then -(item->>'amount_inr')::numeric else 0 end;
   end loop;
   if n>least(-net_from,net_to) then raise exception 'Balances changed. Review the current amount before confirming.' using errcode='40001'; end if;
   l:=jsonb_set(l,'{settlements}',l->'settlements'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'from_member_id',p_data->>'from_member_id','to_member_id',target,'amount_inr',n,'is_settled',true,'settled_at',now(),'confirmed_by',actor::text,'payment_method','manual')));
  elsif p_action='undo_payment' then
   select value into item from jsonb_array_elements(l->'settlements') where value->>'id'=p_data->>'id';
   if item is null or (not host and (item->>'confirmed_by') is distinct from actor::text) then raise exception 'Only the confirming person or owner can undo this record.' using errcode='42501'; end if;
   l:=jsonb_set(l,'{settlements}',coalesce((select jsonb_agg(x) from jsonb_array_elements(l->'settlements') x where x->>'id'<>p_data->>'id'),'[]'));
  else raise exception 'Unsupported room action.' using errcode='22023';
  end if;
  update public.trip_rooms set ledger=l,revision=revision+1,updated_at=now() where trip_id=p_trip_id returning * into r;
 end if;
 if p_action<>'read' then insert into public.trip_room_events(trip_id,user_id,action) values(p_trip_id,actor,p_action); end if;
 return to_jsonb(r)||jsonb_build_object('members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.name,'joined_at',m.joined_at) order by m.joined_at),'[]') from public.trip_room_members m where m.trip_id=p_trip_id));
end $$;
revoke all on function tripweave_private.room_command(uuid,text,jsonb,integer) from public,anon;
grant execute on function tripweave_private.room_command(uuid,text,jsonb,integer) to authenticated;
create function public.trip_room_command(p_trip_id uuid,p_action text,p_data jsonb default '{}',p_expected_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$ select tripweave_private.room_command(p_trip_id,p_action,p_data,p_expected_version); $$;
revoke all on function public.trip_room_command(uuid,text,jsonb,integer) from public,anon;
grant execute on function public.trip_room_command(uuid,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
