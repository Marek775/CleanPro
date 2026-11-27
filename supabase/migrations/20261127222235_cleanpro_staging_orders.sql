-- Install in the dedicated test project only.
alter table public.orders
 add column checkout_delivery text check (checkout_delivery in ('locker', 'courier')),
 add column checkout_payment_method text check (checkout_payment_method in ('blik', 'transfer', 'card', 'cod')),
 add column shipping_grosz integer check (shipping_grosz >= 0),
 add column fee_grosz integer check (fee_grosz >= 0),
 add column discount_grosz bigint check (discount_grosz >= 0);

alter table drop_private.checkout_requests add column checkout_options jsonb;
alter table drop_private.checkout_requests add constraint checkout_requests_order_unique unique (order_id);

insert into drop_private.catalog (store_id, sku, name, unit_grosz, active) values
 ('cleanpro', 'spare-brush', 'Szczotka zapasowa', 2990, true),
 ('cleanpro', 'heavy-brush', 'Szczotka do silnych zabrudzeń', 3990, true),
 ('cleanpro', 'extra-heads', 'Zestaw dodatkowych końcówek', 6990, true)
on conflict (store_id, sku) do nothing;

update drop_private.catalog set active = true
where store_id = 'cleanpro' and sku in ('basic', 'plus', 'premium');

create function public.drop_create_cleanpro_test_order(
 p_request_id uuid, p_items jsonb, p_delivery text, p_payment text, p_coupon text,
 p_expected_total_grosz bigint
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 items jsonb;
 options jsonb;
 saved drop_private.checkout_requests%rowtype;
 result public.orders%rowtype;
 shipping integer;
 fee integer;
 rebate bigint;
begin
 if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
  or p_delivery is null or p_delivery not in ('locker', 'courier')
  or p_payment is null or p_payment not in ('blik', 'transfer', 'card', 'cod')
  or (p_coupon is not null and p_coupon <> 'CLEAN10')
  or p_expected_total_grosz is null or p_expected_total_grosz < 0 then
  raise sqlstate 'PT422' using message = 'Invalid checkout';
 end if;

 if jsonb_array_length(p_items) not between 1 and 6 or exists (
  select 1 from jsonb_array_elements(p_items) i
  where jsonb_typeof(i) is distinct from 'object'
   or jsonb_typeof(i->'sku') is distinct from 'string'
   or jsonb_typeof(i->'quantity') is distinct from 'number'
   or (i->>'quantity') !~ '^[1-9][0-9]?$'
   or i->>'sku' not in ('basic','plus','premium','spare-brush','heavy-brush','extra-heads')
   or i <> jsonb_build_object('sku', i->'sku', 'quantity', i->'quantity')
 ) then
  raise sqlstate 'PT422' using message = 'Invalid checkout items';
 end if;

 select jsonb_agg(i order by i->>'sku') into items from jsonb_array_elements(p_items) i;
 options := jsonb_build_object('delivery', p_delivery, 'payment', p_payment, 'coupon', p_coupon,
  'expectedTotalGrosz', p_expected_total_grosz);

 insert into drop_private.checkout_requests(request_id, store_id, payload, checkout_options)
 values (p_request_id, 'cleanpro', items, options)
 on conflict (request_id) do nothing;
 select * into strict saved from drop_private.checkout_requests where request_id = p_request_id for update;

 if saved.store_id <> 'cleanpro' or saved.payload <> items or saved.checkout_options is distinct from options then
  raise sqlstate 'PT409' using message = 'Idempotency conflict';
 end if;

 if saved.order_id is null then
  begin
   saved.order_id := public.drop_create_order(p_request_id, 'cleanpro', items);
  exception when raise_exception then
   raise sqlstate 'PT422' using message = 'Checkout items unavailable';
  end;
  select * into strict result from public.orders where id = saved.order_id;
  shipping := case when p_delivery = 'courier' then 1499 else 0 end;
  fee := case when p_payment = 'cod' then 500 else 0 end;
  rebate := case when p_coupon = 'CLEAN10' then (result.total_grosz + 5) / 10 else 0 end;

  if result.total_grosz - rebate + shipping + fee <> p_expected_total_grosz then
   raise sqlstate 'PT412' using message = 'Price changed';
  end if;

  update public.orders
  set checkout_delivery = p_delivery, checkout_payment_method = p_payment,
   shipping_grosz = shipping, fee_grosz = fee, discount_grosz = rebate,
   total_grosz = total_grosz - rebate + shipping + fee
  where id = saved.order_id returning * into result;
 else
  select * into strict result from public.orders where id = saved.order_id;
 end if;
 return jsonb_build_object('orderId', result.id, 'totalGrosz', result.total_grosz);
end
$$;

revoke all on function public.drop_create_cleanpro_test_order(uuid,jsonb,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.drop_create_cleanpro_test_order(uuid,jsonb,text,text,text,bigint) to service_role;

-- Keep privileged code out of the exposed schema. Existing RLS policies keep
-- their reference to the relocated admin check.
alter function public.drop_is_admin() set schema drop_private;
grant usage on schema drop_private to authenticated;
create function public.drop_is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select drop_private.drop_is_admin() $$;
revoke all on function public.drop_is_admin() from public, anon;
grant execute on function public.drop_is_admin() to authenticated;

alter function public.drop_update_fulfillment(uuid,text) set schema drop_private;
create or replace function drop_private.drop_update_fulfillment(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
 order_row public.orders%rowtype;
 test_order boolean;
 can_process boolean;
begin
 if not drop_private.drop_is_admin() then
  raise sqlstate '42501' using message = 'Access denied';
 end if;

 select * into order_row from public.orders where id = p_order_id for update;
 if not found then raise sqlstate 'PT404' using message = 'Order not found'; end if;
 test_order := order_row.store_id = 'cleanpro' and order_row.checkout_payment_method is not null;
 can_process := order_row.payment_status = 'paid' or (test_order and order_row.payment_status = 'pending');

 if not coalesce(
  (order_row.fulfillment_status = 'new' and p_status = 'processing' and can_process) or
  (order_row.fulfillment_status = 'processing' and p_status = 'shipped' and can_process) or
  (order_row.fulfillment_status = 'shipped' and p_status = 'delivered') or
  (order_row.fulfillment_status = 'new' and p_status = 'cancelled' and order_row.payment_status in ('pending','failed','refunded')) or
  (order_row.fulfillment_status = 'processing' and p_status = 'cancelled' and
   (order_row.payment_status = 'refunded' or (test_order and order_row.payment_status = 'pending'))),
  false
 ) then
  raise sqlstate 'PT409' using message = 'Invalid status transition';
 end if;

 update public.orders set fulfillment_status = p_status where id = p_order_id;
 insert into drop_private.fulfillment_history(order_id,actor_id,old_status,new_status)
 values (p_order_id,auth.uid(),order_row.fulfillment_status,p_status);
end
$$;
revoke all on function drop_private.drop_update_fulfillment(uuid,text) from public, anon;
grant execute on function drop_private.drop_update_fulfillment(uuid,text) to authenticated;

create function public.drop_update_fulfillment(p_order_id uuid,p_status text)
returns void language sql security invoker set search_path = ''
as $$ select drop_private.drop_update_fulfillment(p_order_id,p_status) $$;
revoke all on function public.drop_update_fulfillment(uuid,text) from public,anon;
grant execute on function public.drop_update_fulfillment(uuid,text) to authenticated;

create index fulfillment_history_order_idx on drop_private.fulfillment_history(order_id,id);
create policy admin_read_fulfillment_history on drop_private.fulfillment_history for select
 to authenticated using ((select drop_private.drop_is_admin()));
grant select on drop_private.fulfillment_history to authenticated;

create function public.drop_get_fulfillment_history(p_order_id uuid)
returns table(actor_id uuid, old_status text, new_status text, changed_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
 select h.actor_id,h.old_status,h.new_status,h.changed_at
 from drop_private.fulfillment_history h where h.order_id = p_order_id order by h.id
$$;
revoke all on function public.drop_get_fulfillment_history(uuid) from public,anon;
grant execute on function public.drop_get_fulfillment_history(uuid) to authenticated;
