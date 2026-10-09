-- Run with a privileged SQL test runner AFTER the migration. All fixtures roll back.
-- This must pass against the actual project before claiming live RLS verification.
begin;
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'rls-a@example.invalid'),
  ('f1000000-0000-4000-8000-000000000002', 'rls-b@example.invalid');
insert into public.saved_trips (user_id, title, destination) values
  ('f1000000-0000-4000-8000-000000000001', 'RLS fixture A', 'Hyderabad'),
  ('f1000000-0000-4000-8000-000000000002', 'RLS fixture B', 'Delhi');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false,"user_metadata":{"role":"admin"}}', true);
do $$
declare affected integer;
begin
  if (select count(*) from public.saved_trips) <> 1 then
    raise exception 'Cross-account SELECT isolation failed';
  end if;
  begin
    insert into public.saved_trips (user_id, title, destination)
      values ('f1000000-0000-4000-8000-000000000002', 'Unauthorized', 'Delhi');
    raise exception 'Cross-account INSERT was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.saved_trips set user_id = 'f1000000-0000-4000-8000-000000000002';
    raise exception 'Ownership transfer was allowed';
  exception when insufficient_privilege then null;
  end;
  delete from public.saved_trips where user_id = 'f1000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-account DELETE was allowed'; end if;
  update public.saved_trips set title = 'Allowed own edit';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner UPDATE failed'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
do $$ begin
  if (select count(*) from public.saved_trips) <> 0 then
    raise exception 'Anonymous identity could access account data';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.saved_trips;
    raise exception 'Unauthenticated table read was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
