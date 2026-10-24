-- Isolated fixtures, all changes rolled back. Run after the room migration.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('f2000000-0000-4000-8000-000000000001','room-owner@example.invalid',now()),
 ('f2000000-0000-4000-8000-000000000002','room-member@example.invalid',now()),
 ('f2000000-0000-4000-8000-000000000003','room-outsider@example.invalid',now()),
 ('f2000000-0000-4000-8000-000000000004','room-unverified@example.invalid',null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
declare t public.saved_trips; req jsonb; snapshot jsonb; r jsonb; invite jsonb; replacement jsonb; bill jsonb; version integer; next_plan jsonb; result jsonb; tid uuid; uid_a text='f2000000-0000-4000-8000-000000000001'; uid_b text='f2000000-0000-4000-8000-000000000002';
begin
 req:='{"destination":"hyderabad","start_date":"2026-10-25","end_date":"2026-10-25","people_count":2,"budget_inr":5000,"pace":"balanced","transport_mode":"cab","interests":["history"],"start_location":"private home","locked_activities":[]}';
 snapshot:='{"schema_version":1,"destination":"Hyderabad","variants":{"balanced":{"variant_type":"balanced","plan_name":"Test room","transport_mode":"cab","total_cost_inr":1600,"estimated_transport_cost_inr":200,"hotel_summary":{"hotel_name":"Private address","nights":0,"total_cost_inr":1000},"days":[{"day_number":1,"date":"2026-10-25","day_cost_inr":400,"activities":[{"place_id":"hyd_charminar","place_name":"Charminar","lat":17.3616,"lng":78.4747,"estimated_cost_inr":400,"start_time":"09:00","end_time":"10:00"}]}]}}}';
 t:=public.create_saved_trip_with_version('Room test','d2000000-0000-4000-8000-000000000001','Hyderabad',1,5000,'2026-10-25','2026-10-25','balanced',req,snapshot);
 tid:=t.id;
 r:=public.trip_room_command(tid,'create','{"name":"Owner"}');
 if r->>'user_id'<>uid_a or r->'plan_data' ? 'stay' or r->'plan_data' ? 'request_data' or (r->'plan_data')::text like '%private home%' then raise exception 'Room projection leaked private fields'; end if;
 invite:=public.trip_room_command(tid,'invite');
 if length(invite->>'token')<>64 then raise exception 'Missing invitation'; end if;
 -- Existing members cannot be self-assigned by raw writes.
 begin update public.trip_rooms set user_id=uid_b::uuid where trip_id=tid; raise exception 'Direct room update allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
 if exists(select 1 from public.trip_rooms where trip_id=tid) or exists(select 1 from public.trip_room_members where trip_id=tid) then raise exception 'Outsider RLS leak'; end if;
 begin perform public.trip_room_command(tid,'read'); raise exception 'Outsider RPC leak'; exception when insufficient_privilege then null; end;
 begin perform public.trip_room_command(tid,'join','{"name":"Bad","token":"not-an-invitation"}'); raise exception 'Bad token joined'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
 r:=public.trip_room_command(tid,'join',jsonb_build_object('name','Friend','token',invite->>'token'));
 if jsonb_array_length(r->'members')<>2 or jsonb_array_length(r->'ledger'->'members')<>2 then raise exception 'Join failed'; end if;
 if exists(select 1 from public.saved_trips where id=tid) or exists(select 1 from public.plan_versions where trip_id=tid) then raise exception 'Member read private source/history'; end if;
 if not exists(select 1 from public.trip_rooms where trip_id=tid) then raise exception 'Member cannot read room under RLS'; end if;
 begin perform public.trip_room_command(tid,'invite'); raise exception 'Member issued invite'; exception when insufficient_privilege then null; end;
 bill:=jsonb_build_object('id','e2000000-0000-4000-8000-000000000001','title','Lunch','amount_inr',100.01,'category','dining','paid_by_member_id',uid_b,'split_type','custom','splits',jsonb_build_array(jsonb_build_object('member_id',uid_a,'amount_inr',50),jsonb_build_object('member_id',uid_b,'amount_inr',50.01)),'created_by',uid_a,'is_settled',true);
 version:=(r->>'revision')::integer;
 begin perform public.trip_room_command(tid,'add_bill',bill||jsonb_build_object('paid_by_member_id',uid_a),version); raise exception 'Forged payer allowed'; exception when insufficient_privilege then null; end;
 begin perform public.trip_room_command(tid,'add_bill',bill||'{"amount_inr":101}'::jsonb,version); raise exception 'Wrong split total allowed'; exception when invalid_parameter_value then null; end;
 r:=public.trip_room_command(tid,'add_bill',bill,version);
 r:=public.trip_room_command(tid,'add_bill',bill,version);
 if jsonb_array_length(r->'ledger'->'expenses')<>1 then raise exception 'A retried bill was duplicated'; end if;
 if r->'ledger'->'expenses'->0->>'created_by'<>uid_b or r->'ledger'->'expenses'->0 ? 'is_settled' then raise exception 'Client controlled actor/payment state'; end if;
 begin perform public.trip_room_command(tid,'add_bill',bill||'{"id":"e2000000-0000-4000-8000-000000000002"}'::jsonb,version); raise exception 'Stale write allowed'; exception when serialization_failure then null; end;
 begin perform public.trip_room_command(tid,'record_payment',jsonb_build_object('from_member_id',uid_a,'to_member_id',uid_b,'amount_inr',50), (r->>'revision')::int); raise exception 'Receipt not required'; exception when insufficient_privilege then null; end;
 -- Payer cannot confirm a payment sent to another person.
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 -- Owner may record a received payment only after explicit confirmation.
 begin perform public.trip_room_command(tid,'record_payment',jsonb_build_object('from_member_id',uid_a,'to_member_id',uid_b,'amount_inr',51,'confirm_received',true),(r->>'revision')::int); raise exception 'Overpayment allowed'; exception when serialization_failure then null; end;
 r:=public.trip_room_command(tid,'record_payment',jsonb_build_object('from_member_id',uid_a,'to_member_id',uid_b,'amount_inr',50,'confirm_received',true,'confirmed_by',uid_b),(r->>'revision')::int);
 if r->'ledger'->'settlements'->0->>'confirmed_by'<>uid_a then raise exception 'Forged confirmation actor'; end if;
 -- Saved changes update room projection atomically without changing the ledger.
 next_plan:=jsonb_set(snapshot,'{variants,balanced,days,0,activities,0,place_name}','"Updated visit"');
 result:=public.commit_trip_version(tid,1,'edit','Updated stop','balanced',next_plan,req);
 r:=public.trip_room_command(tid,'read');
 if r->>'plan_version'<>'2' or r->'plan_data'->'days'->0->'stops'->0->>'name'<>'Updated visit' or jsonb_array_length(r->'ledger'->'expenses')<>1 then raise exception 'Saved edit did not sync correctly'; end if;
 replacement:=public.trip_room_command(tid,'invite');
 perform public.trip_room_command(tid,'remove_member',jsonb_build_object('user_id',uid_b));
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
 if exists(select 1 from public.trip_rooms where trip_id=tid) then raise exception 'Removed member RLS access'; end if;
 begin perform public.trip_room_command(tid,'read'); raise exception 'Removed member RPC access'; exception when insufficient_privilege then null; end;
 begin perform public.trip_room_command(tid,'join',jsonb_build_object('name','Friend','token',replacement->>'token')); raise exception 'Removed member rejoined with old token'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000004","is_anonymous":false}',true);
 begin perform public.trip_room_command(tid,'create'); raise exception 'Unverified account allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","is_anonymous":true}',true);
 if exists(select 1 from public.trip_rooms where trip_id=tid) then raise exception 'Anonymous JWT allowed'; end if;
 perform set_config('request.jwt.claims','{"sub":"f2000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
 r:=public.trip_room_command(tid,'read');
 if jsonb_array_length(r->'ledger'->'expenses')<>1 or jsonb_array_length(r->'ledger'->'members')<>2 then raise exception 'Removing access destroyed bill history'; end if;
 delete from public.saved_trips where id=tid;
 if exists(select 1 from public.trip_rooms where trip_id=tid) then raise exception 'Delete did not cascade'; end if;
 raise notice 'Trip room identity, invitation, membership, RLS, split, conflict, receipt, sync and cascade tests PASSED';
end $$;
rollback;
