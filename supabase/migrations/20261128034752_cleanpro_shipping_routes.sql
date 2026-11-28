alter table public.orders
 add column shipping_source text check (shipping_source in ('supplier', 'self')),
 add column shipping_revision integer not null default 0,
 add column shipping_carrier text,
 add column tracking_number text,
 add column supplier_reference text;

create table drop_private.shipping_history (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id),
 actor_id uuid not null,
 changed_at timestamptz not null default clock_timestamp(),
 previous_source text,
 shipping_source text not null,
 shipping_carrier text,
 tracking_number text,
 supplier_reference text
);
create index shipping_history_order_idx on drop_private.shipping_history(order_id,id);
alter table drop_private.shipping_history enable row level security;
revoke all on drop_private.shipping_history from public,anon,authenticated;
grant select on drop_private.shipping_history to authenticated;
create policy admin_read_shipping_history on drop_private.shipping_history for select
 to authenticated using ((select drop_private.drop_is_admin()));

create function drop_private.drop_save_shipping(p_order_id uuid, p_revision integer, p_source text,
 p_carrier text, p_tracking text, p_supplier_reference text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
 order_row public.orders%rowtype;
 carrier text := nullif(btrim(p_carrier), '');
 tracking text := nullif(btrim(p_tracking), '');
 supplier_ref text := nullif(btrim(p_supplier_reference), '');
begin
 if not drop_private.drop_is_admin() then
  raise sqlstate '42501' using message = 'Access denied';
 end if;
 if p_source is null or p_source not in ('self','supplier') or length(carrier) > 60
  or (tracking is not null and tracking !~ '^[A-Za-z0-9][-A-Za-z0-9 ./]{2,79}$')
  or (supplier_ref is not null and supplier_ref !~ '^[A-Za-z0-9][-A-Za-z0-9 ./]{0,79}$')
  or (p_source = 'self' and supplier_ref is not null) then
  raise sqlstate 'PT422' using message = 'Invalid shipping information';
 end if;
 select * into order_row from public.orders where id = p_order_id and store_id = 'cleanpro'
  and checkout_payment_method is not null for update;
 if not found then raise sqlstate 'PT404' using message = 'Order not found'; end if;
 if order_row.fulfillment_status not in ('new','processing') then
  raise sqlstate 'PT409' using message = 'Shipping details are locked';
 end if;
 if (order_row.shipping_source,order_row.shipping_carrier,order_row.tracking_number,order_row.supplier_reference)
   is not distinct from (p_source,carrier,tracking,supplier_ref) then return; end if;
 if order_row.shipping_revision is distinct from p_revision then
  raise sqlstate 'PT409' using message = 'Shipping information has changed';
 end if;

 update public.orders set shipping_source = p_source, shipping_carrier = carrier,
  tracking_number = tracking, supplier_reference = supplier_ref,
  shipping_revision = shipping_revision + 1 where id = p_order_id;
 insert into drop_private.shipping_history(order_id,actor_id,previous_source,shipping_source,
  shipping_carrier,tracking_number,supplier_reference)
 values (p_order_id,auth.uid(),order_row.shipping_source,p_source,carrier,tracking,supplier_ref);
end
$$;
revoke all on function drop_private.drop_save_shipping(uuid,integer,text,text,text,text) from public,anon;
grant execute on function drop_private.drop_save_shipping(uuid,integer,text,text,text,text) to authenticated;

create function public.drop_save_shipping(p_order_id uuid, p_revision integer, p_source text,
 p_carrier text, p_tracking text, p_supplier_reference text)
returns void language sql security invoker set search_path = ''
as $$ select drop_private.drop_save_shipping(p_order_id,p_revision,p_source,p_carrier,p_tracking,p_supplier_reference) $$;
revoke all on function public.drop_save_shipping(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.drop_save_shipping(uuid,integer,text,text,text,text) to authenticated;

create function public.drop_get_shipping_history(p_order_id uuid)
returns table(actor_id uuid,changed_at timestamptz,previous_source text,shipping_source text,
 shipping_carrier text,tracking_number text,supplier_reference text)
language sql stable security invoker set search_path = ''
as $$
 select h.actor_id,h.changed_at,h.previous_source,h.shipping_source,h.shipping_carrier,h.tracking_number,h.supplier_reference
 from drop_private.shipping_history h where h.order_id = p_order_id order by h.id
$$;
revoke all on function public.drop_get_shipping_history(uuid) from public,anon;
grant execute on function public.drop_get_shipping_history(uuid) to authenticated;

create function drop_private.require_cleanpro_shipping_details()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if new.store_id = 'cleanpro' and new.checkout_payment_method is not null
  and old.fulfillment_status <> 'shipped' and new.fulfillment_status = 'shipped'
  and (new.shipping_source is null or new.shipping_carrier is null or new.tracking_number is null
       or (new.shipping_source = 'supplier' and new.supplier_reference is null)) then
  raise sqlstate 'PT409' using message = 'Complete shipping details before dispatch';
 end if;
 return new;
end
$$;
create trigger require_cleanpro_shipping_details before update of fulfillment_status on public.orders
 for each row execute function drop_private.require_cleanpro_shipping_details();
