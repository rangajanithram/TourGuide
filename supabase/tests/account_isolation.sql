-- Privileged test runner, migrated database. Fixtures are rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email, email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','a@example.invalid',now()),
 ('f1000000-0000-4000-8000-000000000002','b@example.invalid',now()),
 ('f1000000-0000-4000-8000-000000000003','unverified@example.invalid',null);
insert into public.profiles(id,name) values
 ('f1000000-0000-4000-8000-000000000001','A'),
 ('f1000000-0000-4000-8000-000000000002','B') on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
declare t public.saved_trips; retry public.saved_trips; result jsonb; req jsonb; snapshot jsonb; changed jsonb;
begin
 if (select count(*) from public.profiles) <> 1 then raise exception 'Cross-account profile read'; end if;
 update public.profiles set name='Attack' where id='f1000000-0000-4000-8000-000000000002';
 if found then raise exception 'Cross-account profile update'; end if;
 req := '{"destination":"hyderabad","start_date":"2026-10-15","end_date":"2026-10-15","people_count":2,"budget_inr":5000,"pace":"balanced","transport_mode":"cab","interests":["history"],"start_location":"station","locked_activities":["hyd_charminar"]}';
 snapshot := '{"schema_version":1,"destination":"Hyderabad","variants":{"balanced":{"variant_type":"balanced","plan_name":"Test","transport_mode":"cab","total_cost_inr":1600,"estimated_transport_cost_inr":200,"hotel_summary":{"total_cost_inr":1000},"days":[{"day_number":1,"date":"2026-10-15","day_cost_inr":400,"activities":[{"place_id":"hyd_charminar","place_name":"Charminar","lat":17.3616,"lng":78.4747,"estimated_cost_inr":400,"start_time":"09:00","end_time":"10:00"}]}]}}}';
 t := public.create_saved_trip_with_version('Test','d1000000-0000-4000-8000-000000000001','Hyderabad',1,5000,'2026-10-15','2026-10-15','balanced',req,snapshot);
 retry := public.create_saved_trip_with_version('Test','d1000000-0000-4000-8000-000000000001','Hyderabad',1,5000,'2026-10-15','2026-10-15','balanced',req,snapshot);
 if retry.id <> t.id or (select count(*) from public.plan_versions where trip_id=t.id) <> 1 then raise exception 'Retry duplicated initial save'; end if;
 if t.days <> 1 or t.budget_inr <> 5000 then raise exception 'Missing saved metadata'; end if;
 changed := req || '{"start_location":"hotel","locked_activities":[],"pace":"relaxed"}'::jsonb;
 result := public.commit_trip_version(t.id,1,'edit','Changed preferences','balanced',snapshot,changed);
 if (result->'trip'->>'current_version')::int <> 2 or result->'trip'->'request_data' <> changed then raise exception 'Revision lost request'; end if;
 begin perform public.commit_trip_version(t.id,1,'edit','Stale','balanced',snapshot,req); raise exception 'Stale save accepted'; exception when serialization_failure then null; end;
 begin perform public.commit_trip_version(t.id,null,'edit','Null','balanced',snapshot,req); raise exception 'Null version accepted'; exception when serialization_failure then null; end;
 begin update public.plan_versions set change_summary='Forged'; raise exception 'History mutable'; exception when insufficient_privilege then null; end;
 begin delete from public.plan_versions; raise exception 'History deletable'; exception when insufficient_privilege then null; end;
 begin update public.saved_trips set itinerary_data=snapshot; raise exception 'Snapshot direct update allowed'; exception when insufficient_privilege then null; end;
 begin update public.saved_trips set user_id='f1000000-0000-4000-8000-000000000002'; raise exception 'Owner transfer allowed'; exception when insufficient_privilege then null; end;
 begin perform public.commit_trip_version(t.id,2,'edit','Bad costs','balanced',jsonb_set(snapshot,'{variants,balanced,total_cost_inr}','1'),req); raise exception 'Bad costs accepted'; exception when invalid_parameter_value then null; end;
 if (select current_version from public.saved_trips where id=t.id) <> 2 then raise exception 'Invalid commit changed version'; end if;
 result := public.restore_trip_version(t.id,1,2);
 if (result->'trip'->>'current_version')::int <> 3 or result->'trip'->'request_data' <> req then raise exception 'Restore lost historical request'; end if;
 if (select count(*) from public.plan_versions where trip_id=t.id) <> 3 then raise exception 'History lost'; end if;
 update public.saved_trips set title='Renamed' where id=t.id;
 if (select title from public.saved_trips where id=t.id) <> 'Renamed' then raise exception 'Rename failed'; end if;
 perform set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","is_anonymous":false,"user_metadata":{"role":"admin"}}',true);
 if exists(select 1 from public.saved_trips where id=t.id) or exists(select 1 from public.plan_versions where trip_id=t.id) then raise exception 'Cross-user read'; end if;
 update public.saved_trips set title='Attack' where id=t.id;
 if found then raise exception 'Cross-user update'; end if;
 delete from public.saved_trips where id=t.id;
 if found then raise exception 'Cross-user delete'; end if;
 begin perform public.restore_trip_version(t.id,1,3); raise exception 'Cross-user restore'; exception when no_data_found then null; end;
 perform set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","is_anonymous":false,"email_confirmed_at":"forged"}',true);
 if public.is_verified_account_owner(auth.uid()) then raise exception 'Unverified owner allowed'; end if;
 begin perform public.create_saved_trip_with_version('Bad','d1000000-0000-4000-8000-000000000003','Hyderabad',1,5000,'2026-10-15','2026-10-15','balanced',req,snapshot); raise exception 'Unverified create'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","is_anonymous":true}',true);
 if exists(select 1 from public.saved_trips) or exists(select 1 from public.plan_versions) then raise exception 'Anonymous read'; end if;
 perform set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 delete from public.saved_trips where id=t.id;
 if exists(select 1 from public.plan_versions where trip_id=t.id) then raise exception 'Delete cascade failed'; end if;
 raise notice 'Stage 2 ownership, immutable history, validation, idempotency, restore and cascade checks PASSED';
end $$;
rollback;
