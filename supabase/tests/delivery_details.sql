-- Run in the test project. All fixtures roll back.
begin;
select set_config('cleanpro.delivery_admin',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('cleanpro.delivery_admin')::uuid);
insert into drop_private.admins(user_id) values (current_setting('cleanpro.delivery_admin')::uuid);

set local role service_role;
do $$
declare
 req uuid := gen_random_uuid();
 items jsonb := '[{"sku":"plus","quantity":1}]';
 locker jsonb := '{"name":"Jan Testowy","email":"locker@example.invalid","phone":"500000000","lockerCode":"TEST01"}';
 courier jsonb := '{"name":"Anna Testowa","email":"courier@example.invalid","phone":"500000001","street":"Testowa 1","postalCode":"00-001","city":"Warszawa"}';
 receipt jsonb;
begin
 receipt := public.drop_create_cleanpro_test_order_with_delivery(req,items,'locker','blik',null,24900,locker);
 if receipt is distinct from public.drop_create_cleanpro_test_order_with_delivery(
  req,items,'locker','blik',null,24900,locker) then raise exception 'Retry returned a different receipt'; end if;
 perform set_config('cleanpro.locker_order',receipt->>'orderId',true);
 begin
  perform public.drop_create_cleanpro_test_order_with_delivery(req,items,'locker','blik',null,24900,
   locker || '{"lockerCode":"TEST02"}'::jsonb);
  raise exception 'Changed recipient accepted on retry';
 exception when sqlstate 'PT409' then null;
 end;
 begin
  perform public.drop_create_cleanpro_test_order_with_delivery(gen_random_uuid(),items,'courier','blik',null,26399,locker);
  raise exception 'Missing courier address accepted';
 exception when sqlstate 'PT400' then null;
 end;
 receipt := public.drop_create_cleanpro_test_order_with_delivery(gen_random_uuid(),items,'courier','blik',null,26399,courier);
 perform set_config('cleanpro.courier_order',receipt->>'orderId',true);
end
$$;
reset role;

select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$
begin
 if public.drop_get_delivery_details(current_setting('cleanpro.locker_order')::uuid) is not null then
  raise exception 'Account without admin access can see recipient data';
 end if;
end
$$;
reset role;

do $$
begin
 if has_function_privilege('anon','public.drop_get_delivery_details(uuid)','EXECUTE')
  or has_function_privilege('authenticated','public.drop_create_cleanpro_test_order_with_delivery(uuid,jsonb,text,text,text,bigint,jsonb)','EXECUTE')
  or has_table_privilege('authenticated','drop_private.delivery_details','INSERT') then
  raise exception 'Unexpected privileges';
 end if;
end
$$;

select set_config('request.jwt.claim.sub',current_setting('cleanpro.delivery_admin'),true);
set local role authenticated;
do $$
declare
 locker_id uuid := current_setting('cleanpro.locker_order')::uuid;
 courier_id uuid := current_setting('cleanpro.courier_order')::uuid;
begin
 if public.drop_get_delivery_details(locker_id)->>'lockerCode' is distinct from 'TEST01'
  or public.drop_get_delivery_details(courier_id)->>'street' is distinct from 'Testowa 1'
  or public.drop_get_delivery_details(courier_id)->>'postalCode' is distinct from '00-001' then
  raise exception 'Recipient data is missing or altered';
 end if;
 perform public.drop_save_shipping(locker_id,0,'self','InPost','TEST-OWN',null);
 perform public.drop_save_shipping(courier_id,0,'supplier','DPD','TEST-SUP','SUP-TEST');
 if not exists(select 1 from public.orders where id=locker_id and shipping_source='self' and total_grosz=24900)
  or not exists(select 1 from public.orders where id=courier_id and shipping_source='supplier' and total_grosz=26399) then
  raise exception 'Shipping paths did not preserve expected amounts';
 end if;
end
$$;
reset role;
select 'recipient privacy, atomic checkout, retries and both routes passed' as result;
rollback;
