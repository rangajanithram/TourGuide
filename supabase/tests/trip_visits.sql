-- Run after migrations. Fictional test users and all writes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f3000000-0000-4000-8000-000000000001','visit-owner@example.invalid',now()),
 ('f3000000-0000-4000-8000-000000000002','visit-member@example.invalid',now()),
 ('f3000000-0000-4000-8000-000000000003','visit-outsider@example.invalid',now()),
 ('f3000000-0000-4000-8000-000000000004','visit-unverified@example.invalid',null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
declare t public.saved_trips; req jsonb; snapshot jsonb; r jsonb; v jsonb; token jsonb; k text; tid uuid;
begin
 req:='{"destination":"hyderabad","start_date":"2026-10-25","end_date":"2026-10-25","people_count":2,"budget_inr":5000,"pace":"balanced","transport_mode":"cab","locked_activities":[]}';
 snapshot:='{"schema_version":1,"destination":"Hyderabad","variants":{"balanced":{"variant_type":"balanced","plan_name":"Visit test","transport_mode":"cab","total_cost_inr":400,"estimated_transport_cost_inr":0,"days":[{"day_number":1,"date":"2026-10-25","day_cost_inr":400,"activities":[{"place_id":"hyd_charminar","lat":17.36,"lng":78.47,"place_type":"attraction","place_name":"Charminar","estimated_cost_inr":400,"start_time":"09:00","end_time":"10:00"}]}]}}}';
 t:=public.create_saved_trip_with_version('Visit test','d3000000-0000-4000-8000-000000000001','Hyderabad',1,5000,'2026-10-25','2026-10-25','balanced',req,snapshot);
 tid:=t.id;
 -- Owner sync works even before a room exists.
 v:=public.trip_visit_command(tid,'read'); k:=v->'stops'->0->>'key';
 if v->'stops'->0->>'revision'<>'0' or v ? 'request_data' then raise exception 'Invalid initial progress projection'; end if;
 v:=public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',true,'revision',0),1);
 if v->'stops'->0->>'visited'<>'true' then raise exception 'Mark failed'; end if;
 v:=public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',true,'revision',0),1);
 if v->'stops'->0->>'revision'<>'1' then raise exception 'Retry was not idempotent'; end if;
 begin perform public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',false,'revision',0),1); raise exception 'Stale toggle allowed'; exception when serialization_failure then null; end;
 begin update public.trip_stop_visits set visited=false where trip_id=tid; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.trip_visit_command(tid,'set',jsonb_build_object('key',repeat('a',64),'visited',true,'revision',0),1); raise exception 'Arbitrary key allowed'; exception when invalid_parameter_value then null; end;
 r:=public.trip_room_command(tid,'create','{"name":"Owner"}'); token:=public.trip_room_command(tid,'invite');
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
 if exists(select 1 from public.trip_stop_visits where trip_id=tid) then raise exception 'Outsider RLS leak'; end if;
 begin perform public.trip_visit_command(tid,'read'); raise exception 'Outsider read'; exception when insufficient_privilege then null; end;
 begin perform public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',false,'revision',1),1); raise exception 'Outsider write'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
 r:=public.trip_room_command(tid,'join',jsonb_build_object('name','Member','token',token->>'token'));
 if not exists(select 1 from public.trip_stop_visits where trip_id=tid and visited) then raise exception 'Member cannot read checks'; end if;
 v:=public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',false,'revision',1,'user_id','f3000000-0000-4000-8000-000000000003'),1);
 if not exists(select 1 from public.trip_stop_visits where trip_id=tid and changed_by=auth.uid() and user_id='f3000000-0000-4000-8000-000000000001') then raise exception 'Actor or owner trusted from client'; end if;
 if exists(select 1 from public.saved_trips where id=tid) then raise exception 'Member private plan leak'; end if;
 r:=public.trip_room_command(tid,'read');
 if jsonb_array_length(r->'ledger'->'expenses')<>0 then raise exception 'Visit check fabricated bill'; end if;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 v:=public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',true,'revision',2),1);
 -- Moving times preserves completion, replacing a venue must not inherit it.
 snapshot:=jsonb_set(snapshot,'{variants,balanced,days,0,activities,0,start_time}','"09:30"');
 perform public.commit_trip_version(tid,1,'edit','Move time','balanced',snapshot,req);
 v:=public.trip_visit_command(tid,'read');
 if v->'stops'->0->>'key'<>k or v->'stops'->0->>'visited'<>'true' then raise exception 'Time edit lost completion'; end if;
 begin perform public.trip_visit_command(tid,'set',jsonb_build_object('key',k,'visited',false,'revision',3),1); raise exception 'Old plan version allowed'; exception when serialization_failure then null; end;
 snapshot:=jsonb_set(snapshot,'{variants,balanced,days,0,activities,0,place_id}','"new-place"');
 perform public.commit_trip_version(tid,2,'edit','Replace venue','balanced',snapshot,req);
 v:=public.trip_visit_command(tid,'read');
 if v->'stops'->0->>'key'=k or v->'stops'->0->>'visited'<>'false' then raise exception 'Replacement inherited completion'; end if;
 r:=public.trip_room_command(tid,'settings','{"enabled":false}');
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
 if exists(select 1 from public.trip_stop_visits where trip_id=tid) then raise exception 'Paused room RLS leak'; end if;
 begin perform public.trip_visit_command(tid,'read'); raise exception 'Paused member read'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 perform public.trip_room_command(tid,'settings','{"enabled":true}');
 perform public.trip_room_command(tid,'remove_member','{"user_id":"f3000000-0000-4000-8000-000000000002"}');
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
 begin perform public.trip_visit_command(tid,'read'); raise exception 'Removed member read'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000004","is_anonymous":false}',true);
 begin perform public.trip_visit_command(tid,'read'); raise exception 'Unverified read'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","is_anonymous":true}',true);
 begin perform public.trip_visit_command(tid,'read'); raise exception 'Anonymous read'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f3000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 delete from public.saved_trips where id=tid;
 if exists(select 1 from public.trip_stop_visits where trip_id=tid) then raise exception 'Visit cascade failed'; end if;
 raise notice 'Visit identity, CAS, retries, owner/member authorization, privacy, edit identity and cascade tests PASSED';
end $$;
rollback;
