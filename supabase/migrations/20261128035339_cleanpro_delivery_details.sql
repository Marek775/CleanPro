create table drop_private.delivery_details (
 order_id uuid primary key references public.orders(id) on delete cascade,
 recipient jsonb not null check (jsonb_typeof(recipient) = 'object')
);
alter table drop_private.delivery_details enable row level security;
revoke all on drop_private.delivery_details from public, anon, authenticated;
grant select on drop_private.delivery_details to authenticated;
create policy admin_read_delivery_details on drop_private.delivery_details for select
 to authenticated using ((select drop_private.drop_is_admin()));

create function public.drop_create_cleanpro_test_order_with_delivery(
 p_request_id uuid,p_items jsonb,p_delivery text,p_payment text,p_coupon text,
 p_expected_total_grosz bigint,p_recipient jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 receipt jsonb;
 saved_recipient jsonb;
 order_ref uuid;
 expected_keys text[];
begin
 expected_keys := case p_delivery
  when 'locker' then array['name','email','phone','lockerCode']
  when 'courier' then array['name','email','phone','street','postalCode','city'] end;
 if expected_keys is null or jsonb_typeof(p_recipient) is distinct from 'object'
  or not (p_recipient ?& expected_keys) or p_recipient - expected_keys <> '{}'::jsonb then
  raise sqlstate 'PT400' using message = 'Invalid recipient';
 end if;
 if exists (select 1 from jsonb_each(p_recipient) f(key,value)
  where jsonb_typeof(f.value) <> 'string' or length(btrim(f.value #>> '{}')) = 0
   or (f.value #>> '{}') ~ '[[:cntrl:]]'
   or length(f.value #>> '{}') > case f.key when 'email' then 254 when 'street' then 140
     when 'name' then 100 when 'city' then 100 when 'postalCode' then 6 else 24 end
 ) or p_recipient->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   or p_recipient->>'phone' !~ '^[+]?[0-9][0-9 ()-]{6,22}$'
   or (p_delivery = 'locker' and p_recipient->>'lockerCode' !~ '^[A-Z0-9-]{3,24}$')
   or (p_delivery = 'courier' and p_recipient->>'postalCode' !~ '^[0-9]{2}-[0-9]{3}$') then
  raise sqlstate 'PT400' using message = 'Invalid recipient';
 end if;

 receipt := public.drop_create_cleanpro_test_order(p_request_id,p_items,p_delivery,p_payment,
  p_coupon,p_expected_total_grosz);
 order_ref := (receipt->>'orderId')::uuid;
 insert into drop_private.delivery_details(order_id,recipient) values (order_ref,p_recipient)
 on conflict (order_id) do nothing;
 select d.recipient into strict saved_recipient from drop_private.delivery_details d where d.order_id=order_ref;
 if saved_recipient is distinct from p_recipient then
  raise sqlstate 'PT409' using message = 'Idempotency conflict';
 end if;
 return receipt;
end
$$;
revoke all on function public.drop_create_cleanpro_test_order_with_delivery(uuid,jsonb,text,text,text,bigint,jsonb)
 from public,anon,authenticated;
grant execute on function public.drop_create_cleanpro_test_order_with_delivery(uuid,jsonb,text,text,text,bigint,jsonb)
 to service_role;

create function public.drop_get_delivery_details(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select d.recipient from drop_private.delivery_details d where d.order_id=p_order_id $$;
revoke all on function public.drop_get_delivery_details(uuid) from public,anon;
grant execute on function public.drop_get_delivery_details(uuid) to authenticated;
