-- Run against staging after migrations. All fixtures roll back.
begin;
select set_config('cleanpro.shipping_admin',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('cleanpro.shipping_admin')::uuid);
insert into drop_private.admins(user_id) values (current_setting('cleanpro.shipping_admin')::uuid);
select set_config('request.jwt.claim.sub',current_setting('cleanpro.shipping_admin'),true);
set local role service_role;
select set_config('cleanpro.self_id',public.drop_create_cleanpro_test_order(gen_random_uuid(),
 '[{"sku":"basic","quantity":1}]','locker','blik',null,19900)->>'orderId',true);
select set_config('cleanpro.supplier_id',public.drop_create_cleanpro_test_order(gen_random_uuid(),
 '[{"sku":"basic","quantity":1}]','courier','blik',null,21399)->>'orderId',true);
reset role;
set local role authenticated;
do $$
declare
 self_id uuid := current_setting('cleanpro.self_id')::uuid;
 supplier_id uuid := current_setting('cleanpro.supplier_id')::uuid;
begin
 perform public.drop_update_fulfillment(self_id,'processing');
 begin
  perform public.drop_update_fulfillment(self_id,'shipped');
  raise exception 'Dispatch without details accepted';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.drop_save_shipping(self_id,0,'self','InPost','TEST-SELF',null);
 perform public.drop_save_shipping(self_id,0,'self','InPost','TEST-SELF',null);
 begin
  perform public.drop_save_shipping(self_id,0,'self','InPost','TEST-STALE',null);
  raise exception 'Stale change accepted';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.drop_update_fulfillment(self_id,'shipped');
 perform public.drop_update_fulfillment(self_id,'delivered');
 begin
  perform public.drop_save_shipping(self_id,1,'supplier','InPost','TEST-CHANGED','SUP-001');
  raise exception 'Delivered order accepted edits';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.drop_update_fulfillment(supplier_id,'processing');
 perform public.drop_save_shipping(supplier_id,0,'supplier','DPD','TEST-SUPPLIER',null);
 begin
  perform public.drop_update_fulfillment(supplier_id,'shipped');
  raise exception 'Missing supplier reference accepted';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.drop_save_shipping(supplier_id,1,'supplier','DPD','TEST-SUPPLIER','SUP-001');
 perform public.drop_update_fulfillment(supplier_id,'shipped');
 if (select count(*) from public.drop_get_shipping_history(self_id)) <> 1
 or (select count(*) from public.drop_get_shipping_history(supplier_id)) <> 2
 or not exists(select 1 from public.orders where id=supplier_id and fulfillment_status='shipped'
  and supplier_reference='SUP-001' and payment_status='pending') then
  raise exception 'Missing shipping audit or inconsistent status';
 end if;
end
$$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$
declare target uuid := current_setting('cleanpro.self_id')::uuid;
begin
 if exists(select from public.drop_get_shipping_history(target)) then
  raise exception 'Non-admin could read shipping history';
 end if;
 begin
  perform public.drop_save_shipping(target,1,'self','InPost','TEST-UNAUTHORIZED',null);
  raise exception 'Non-admin could edit shipment';
 exception when insufficient_privilege then null;
 end;
end
$$;
reset role;
select 'both shipping routes, permissions and audit passed' as result;

rollback;
