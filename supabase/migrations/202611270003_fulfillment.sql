begin;
create table drop_private.fulfillment_history (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id),
 actor_id uuid not null,
 old_status text not null,
 new_status text not null,
 changed_at timestamptz not null default now()
);
alter table drop_private.fulfillment_history enable row level security;
revoke all on drop_private.fulfillment_history from public, anon, authenticated;
create function public.drop_update_fulfillment(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare previous text; payment text;
begin
 if not public.drop_is_admin() then raise exception 'Access denied' using errcode='42501'; end if;
 select fulfillment_status,payment_status into previous,payment from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if p_status is null or not (
 (previous='new' and p_status='processing' and payment='paid') or
 (previous='processing' and p_status='shipped' and payment='paid') or
 (previous='shipped' and p_status='delivered') or
 (previous='new' and p_status='cancelled' and payment in ('pending','failed','refunded')) or
 (previous='processing' and p_status='cancelled' and payment='refunded')
 ) then raise exception 'Invalid transition'; end if;
 update public.orders set fulfillment_status=p_status where id=p_order_id;
 insert into drop_private.fulfillment_history(order_id,actor_id,old_status,new_status)
 values(p_order_id,auth.uid(),previous,p_status);
end $$;
revoke all on function public.drop_update_fulfillment(uuid,text) from public,anon;
grant execute on function public.drop_update_fulfillment(uuid,text) to authenticated;
commit;
