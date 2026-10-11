-- Read-only deployment gate. Run after migrations and before releasing the frontend.
do $$
declare signature text; fn regprocedure;
begin
  foreach signature in array array[
    'public.create_saved_trip_with_version(text,uuid,text,integer,integer,date,date,text,jsonb,jsonb,jsonb,integer)',
    'public.commit_trip_version(uuid,integer,text,text,text,jsonb,jsonb,jsonb,integer,integer)',
    'public.restore_trip_version(uuid,integer,integer)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'Missing required saved-trip function: %', signature; end if;
    if not has_function_privilege('authenticated', fn, 'execute')
       or has_function_privilege('anon', fn, 'execute') then
      raise exception 'Incorrect access permissions: %', signature;
    end if;
  end loop;
  if not exists(select 1 from pg_class where oid=to_regclass('public.saved_trips') and relrowsecurity and relforcerowsecurity)
     or not exists(select 1 from pg_class where oid=to_regclass('public.plan_versions') and relrowsecurity and relforcerowsecurity) then
    raise exception 'Saved-trip RLS is missing';
  end if;
  if exists(select 1 from pg_roles where rolname='tripweave_trip_writer' and (rolcanlogin or rolbypassrls or rolsuper)) then
    raise exception 'Unsafe writer role';
  end if;
  if to_regprocedure('tripweave_private.session_uid()') is null then
    raise exception 'Hosted identity bridge is missing';
  end if;
end $$;
select 'Saved-trip deployment contract passed' as result;
