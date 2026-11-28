alter table public.orders add column stripe_test_started_at timestamptz;

create table drop_private.stripe_test_payments (
 order_id uuid primary key references public.orders(id),
 intent_id text unique
);
create table drop_private.stripe_test_events (
 event_id text primary key,
 order_id uuid not null references public.orders(id),
 received_at timestamptz not null default clock_timestamp(),
 event_status text not null check (event_status in ('paid','failed','refunded'))
);
alter table drop_private.stripe_test_payments enable row level security;
alter table drop_private.stripe_test_events enable row level security;
revoke all on drop_private.stripe_test_payments,drop_private.stripe_test_events from public,anon,authenticated;

create function public.drop_begin_stripe_test(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare ord public.orders%rowtype;
begin
 select * into ord from public.orders where id=p_order_id and store_id='cleanpro'
  and checkout_payment_method='card' for update;
 if not found then raise sqlstate 'PT404' using message='Order not found'; end if;
 if ord.payment_status <> 'pending' or ord.fulfillment_status <> 'new'
  or (ord.stripe_test_started_at is not null and ord.stripe_test_started_at < now() - interval '30 minutes')
 then return false; end if;
 if ord.stripe_test_started_at is null then
  update public.orders set stripe_test_started_at=now() where id=p_order_id;
  insert into drop_private.stripe_test_payments(order_id) values(p_order_id);
 end if;
 return true;
end
$$;
revoke all on function public.drop_begin_stripe_test(uuid) from public,anon,authenticated;
grant execute on function public.drop_begin_stripe_test(uuid) to service_role;

create function public.drop_apply_stripe_test_event(
 p_order_id uuid,p_event_id text,p_status text,p_amount bigint,p_currency text,p_intent text
) returns void language plpgsql security definer set search_path = ''
as $$
declare
 ord public.orders%rowtype;
 saved_intent text;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$'
  or p_status is null or p_status not in ('paid','failed','refunded')
  or p_currency is distinct from 'pln'
  or (p_status in ('paid','refunded') and (p_intent is null or p_intent !~ '^pi_[A-Za-z0-9]+$'))
  or (p_status='failed' and p_intent is not null)
 then return; end if;

 select * into ord from public.orders where id=p_order_id and store_id='cleanpro'
  and stripe_test_started_at is not null for update;
 if not found or ord.total_grosz is distinct from p_amount then return; end if;
 select intent_id into strict saved_intent from drop_private.stripe_test_payments where order_id=p_order_id;
 if p_intent is not null and saved_intent is not null and saved_intent <> p_intent then return; end if;
 insert into drop_private.stripe_test_events(event_id,order_id,event_status) values(p_event_id,p_order_id,p_status)
 on conflict (event_id) do nothing;
 if not found then return; end if;
 if p_intent is not null and saved_intent is null then
  update drop_private.stripe_test_payments set intent_id=p_intent where order_id=p_order_id;
 end if;
 if (p_status='paid' and ord.payment_status in ('pending','failed'))
  or (p_status='failed' and ord.payment_status='pending')
  or (p_status='refunded' and ord.payment_status <> 'refunded') then
  update public.orders set payment_status=p_status where id=p_order_id;
 end if;
end
$$;
revoke all on function public.drop_apply_stripe_test_event(uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.drop_apply_stripe_test_event(uuid,text,text,bigint,text,text) to service_role;

create function drop_private.require_stripe_test_payment()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if new.stripe_test_started_at is not null and new.fulfillment_status is distinct from old.fulfillment_status
  and new.fulfillment_status in ('processing','shipped') and new.payment_status <> 'paid' then
  raise sqlstate 'PT409' using message='Payment must be confirmed before fulfillment';
 end if;
 if new.stripe_test_started_at is not null and old.fulfillment_status <> 'cancelled'
  and new.fulfillment_status = 'cancelled' and new.payment_status = 'pending' then
  raise sqlstate 'PT409' using message='Wait for the Stripe session to expire before cancellation';
 end if;
 return new;
end
$$;
create trigger require_stripe_test_payment before update of fulfillment_status on public.orders
 for each row execute function drop_private.require_stripe_test_payment();
