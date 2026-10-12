begin;
insert into public.places(city,place_id,payload,published) values ('hyderabad','catalog_test_private','{"place_id":"catalog_test_private"}',false);
set local role anon;
do $$ begin
 if not exists(select 1 from public.places where city='hyderabad') then raise exception 'Published catalog unreadable'; end if;
 if exists(select 1 from public.places where place_id='catalog_test_private') then raise exception 'Draft exposed'; end if;
 begin update public.places set published=false; raise exception 'Update allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.places; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.places(city,place_id,payload) values ('hyderabad','bad','{}'); raise exception 'Insert allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.places where place_id='catalog_test_private') then raise exception 'Draft exposed'; end if;
 if not exists(select 1 from public.places where city='hyderabad') then raise exception 'Published catalog unreadable'; end if;
 begin update public.places set published=false; raise exception 'Update allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.places; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.places(city,place_id,payload) values ('hyderabad','bad','{}'); raise exception 'Insert allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
