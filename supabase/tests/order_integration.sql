-- Run after the staging migrations as the test database operator.
-- All fixtures and changes roll back.
begin;
select set_config('cleanpro.test_admin', gen_random_uuid()::text, true);
select set_config('cleanpro.test_other_user', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('cleanpro.test_admin')::uuid);
insert into drop_private.admins(user_id) values (current_setting('cleanpro.test_admin')::uuid);

do $$
begin
 if has_table_privilege('anon', 'public.orders', 'SELECT')
  or has_table_privilege('authenticated', 'public.orders', 'UPDATE')
  or has_table_privilege('authenticated', 'drop_private.fulfillment_history', 'INSERT')
  or has_function_privilege('anon', 'public.drop_get_fulfillment_history(uuid)', 'EXECUTE')
  or has_function_privilege('anon', 'public.drop_update_fulfillment(uuid,text)', 'EXECUTE')
  or has_function_privilege('authenticated', 'public.drop_create_cleanpro_test_order(uuid,jsonb,text,text,text,bigint)', 'EXECUTE')
  or not has_function_privilege('service_role', 'public.drop_create_cleanpro_test_order(uuid,jsonb,text,text,text,bigint)', 'EXECUTE') then
  raise exception 'Invalid grants';
 end if;
end
$$;

set local role service_role;
do $$
declare
 req uuid := gen_random_uuid();
 first jsonb;
 replay jsonb;
 lines jsonb := '[{"sku":"plus","quantity":2},{"sku":"spare-brush","quantity":1}]';
 reversed jsonb := '[{"sku":"spare-brush","quantity":1},{"sku":"plus","quantity":2}]';
begin
 -- 2 × 24900 + 2990 − 5279 + 1499 + 500 = 49510 grosz.
 first := public.drop_create_cleanpro_test_order(req,lines,'courier','cod','CLEAN10',49510);
 replay := public.drop_create_cleanpro_test_order(req,reversed,'courier','cod','CLEAN10',49510);
 if replay is distinct from first or (first->>'totalGrosz')::bigint <> 49510 then
  raise exception 'Incorrect total or idempotency';
 end if;
 perform set_config('cleanpro.test_order',first->>'orderId',true);
 perform set_config('cleanpro.valid_request',req::text,true);

 begin
  perform public.drop_create_cleanpro_test_order(req,lines,'locker','cod','CLEAN10',48011);
  raise exception 'Conflicting idempotency key accepted';
 exception when sqlstate 'PT409' then null;
 end;
 req := gen_random_uuid();
 perform set_config('cleanpro.rejected_request',req::text,true);
 begin
  perform public.drop_create_cleanpro_test_order(req,lines,'courier','cod','CLEAN10',1);
  raise exception 'Manipulated or stale price accepted';
 exception when sqlstate 'PT412' then null;
 end;
 begin
  perform public.drop_create_cleanpro_test_order(gen_random_uuid(),
   '[{"sku":"plus","quantity":1,"price":1}]','locker','blik',null,24900);
  raise exception 'Custom item price accepted';
 exception when sqlstate 'PT422' then null;
 end;
 begin
  perform public.drop_create_cleanpro_test_order(gen_random_uuid(),
   '[{"sku":"plus","quantity":1},{"sku":"plus","quantity":1}]','locker','blik',null,49800);
  raise exception 'Duplicate SKU accepted';
 exception when sqlstate 'PT422' then null;
 end;
end
$$;
reset role;

do $$
declare
 target uuid := current_setting('cleanpro.test_order')::uuid;
begin
 if not exists (select 1 from public.orders where id=target and store_id='cleanpro' and
  total_grosz=49510 and shipping_grosz=1499 and fee_grosz=500 and discount_grosz=5279
  and payment_status='pending' and fulfillment_status='new') or
  (select count(*) from public.order_items where order_id=target) <> 2 or
  (select sum(unit_grosz*quantity) from public.order_items where order_id=target) <> 52790 or
  not exists (select 1 from drop_private.checkout_requests where
   request_id=current_setting('cleanpro.valid_request')::uuid and order_id=target) or
  exists (select 1 from drop_private.checkout_requests where request_id=current_setting('cleanpro.rejected_request')::uuid) then
  raise exception 'Incorrect order snapshot or incomplete rollback';
 end if;
end
$$;

select set_config('request.jwt.claim.sub',current_setting('cleanpro.test_other_user'),true);
set local role authenticated;
do $$
declare
 target uuid := current_setting('cleanpro.test_order')::uuid;
begin
 if public.drop_is_admin() or exists(select 1 from public.orders where id=target)
  or exists(select 1 from public.order_items where order_id=target)
  or exists(select 1 from public.drop_get_fulfillment_history(target)) then
  raise exception 'Non-admin can read private order data';
 end if;
 begin
  perform public.drop_update_fulfillment(target,'processing');
  raise exception 'Non-admin can change status';
 exception when insufficient_privilege then null;
 end;
end
$$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('cleanpro.test_admin'),true);
set local role authenticated;
do $$
declare
 target uuid := current_setting('cleanpro.test_order')::uuid;
begin
 if not public.drop_is_admin() or not exists(select 1 from public.orders where id=target)
  or (select count(*) from public.order_items where order_id=target) <> 2 then
  raise exception 'Admin cannot read order';
 end if;
 begin
  perform public.drop_update_fulfillment(target,'shipped');
  raise exception 'Invalid transition was allowed';
 exception when sqlstate 'PT409' then null;
 end;
 perform public.drop_update_fulfillment(target,'processing');
 perform public.drop_update_fulfillment(target,'shipped');
 perform public.drop_update_fulfillment(target,'delivered');
 if (select count(*) from public.drop_get_fulfillment_history(target)
  where actor_id=auth.uid() and changed_at is not null
   and (old_status,new_status) in (('new','processing'),('processing','shipped'),('shipped','delivered'))) <> 3
  or (select count(*) from public.drop_get_fulfillment_history(target)) <> 3
  or not exists(select 1 from public.orders where id=target and fulfillment_status='delivered' and payment_status='pending') then
  raise exception 'Incorrect audit history or payment status changed';
 end if;
end
$$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('cleanpro.test_other_user'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.drop_get_fulfillment_history(current_setting('cleanpro.test_order')::uuid)) then
  raise exception 'Non-admin can read nonempty history';
 end if;
end
$$;
reset role;
select 'checkout, totals, idempotency, permissions and status history passed' as result;
rollback;
