-- Staging only. All fixtures roll back.
begin;
select set_config('cleanpro.stripe_admin',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('cleanpro.stripe_admin')::uuid);
insert into drop_private.admins(user_id) values(current_setting('cleanpro.stripe_admin')::uuid);
select set_config('request.jwt.claim.sub',current_setting('cleanpro.stripe_admin'),true);
set local role service_role;
select set_config('cleanpro.stripe_order',public.drop_create_cleanpro_test_order(gen_random_uuid(),
 '[{"sku":"plus","quantity":1}]','locker','card',null,24900)->>'orderId',true);
select set_config('cleanpro.stripe_expired_order',public.drop_create_cleanpro_test_order(gen_random_uuid(),
 '[{"sku":"basic","quantity":1}]','locker','card',null,19900)->>'orderId',true);
do $$
begin
 if not public.drop_begin_stripe_test(current_setting('cleanpro.stripe_order')::uuid)
  or not public.drop_begin_stripe_test(current_setting('cleanpro.stripe_order')::uuid)
  or not public.drop_begin_stripe_test(current_setting('cleanpro.stripe_expired_order')::uuid) then
  raise exception 'Test session could not start';
 end if;
end
$$;
reset role;
set local role authenticated;
do $$
declare order_ref uuid := current_setting('cleanpro.stripe_order')::uuid;
begin
 begin
  perform public.drop_update_fulfillment(order_ref,'processing');
  raise exception 'Unpaid card order could enter fulfillment';
 exception when sqlstate 'PT409' then null;
 end;
 begin
  perform public.drop_update_fulfillment(order_ref,'cancelled');
  raise exception 'Open card session was not protected';
 exception when sqlstate 'PT409' then null;
 end;
end
$$;
reset role;
set local role service_role;
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_badamount','paid',1,'pln','pi_testcleanpro');
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_badcurrency','paid',24900,'usd','pi_testcleanpro');
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_expired_order')::uuid,
 'evt_expired','failed',19900,'pln',null);
reset role;
do $$
begin
 if not exists(select 1 from public.orders where id=current_setting('cleanpro.stripe_order')::uuid and payment_status='pending')
  or not exists(select 1 from public.orders where id=current_setting('cleanpro.stripe_expired_order')::uuid and payment_status='failed') then
  raise exception 'Invalid amount or currency accepted, or expiry not processed';
 end if;
end
$$;
set local role service_role;
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_testpaid','paid',24900,'pln','pi_testcleanpro');
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_testpaid','paid',24900,'pln','pi_testcleanpro');
reset role;
set local role authenticated;
select public.drop_update_fulfillment(current_setting('cleanpro.stripe_order')::uuid,'processing');
select public.drop_update_fulfillment(current_setting('cleanpro.stripe_expired_order')::uuid,'cancelled');
reset role;
set local role service_role;
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_otherintent','refunded',24900,'pln','pi_other');
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_testrefund','refunded',24900,'pln','pi_testcleanpro');
select public.drop_apply_stripe_test_event(current_setting('cleanpro.stripe_order')::uuid,
 'evt_latepaid','paid',24900,'pln','pi_testcleanpro');
reset role;
do $$
declare order_ref uuid := current_setting('cleanpro.stripe_order')::uuid;
begin
 if not exists(select 1 from public.orders where id=order_ref and payment_status='refunded')
  or (select count(*) from drop_private.stripe_test_events where order_id=order_ref) <> 3
  or has_function_privilege('authenticated','public.drop_apply_stripe_test_event(uuid,text,text,bigint,text,text)','EXECUTE')
  or has_function_privilege('anon','public.drop_begin_stripe_test(uuid)','EXECUTE') then
  raise exception 'Refund, retry, event ordering or permission check failed';
 end if;
end
$$;
select 'Stripe ledger, amount, currency, retries, expiry, fulfillment and full refund passed' as result;
rollback;
