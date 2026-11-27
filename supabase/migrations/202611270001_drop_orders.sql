-- Drop Admin: initial schema for a dedicated Supabase project.
-- Apply through a reviewed migration; not yet deployed.
begin;
create table public.stores (
 id text primary key,
 name text not null
);
insert into public.stores values ('cleanpro','CleanPro'),('gardenpro','GardenPro');
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 store_id text not null references public.stores(id),
 created_at timestamptz not null default now(),
 currency text not null default 'PLN' check (currency='PLN'),
 total_grosz bigint not null check(total_grosz>=0),
 fulfillment_status text not null default 'new' check(fulfillment_status in ('new','processing','shipped','delivered','cancelled')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','failed','refunded'))
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 sku text not null,
 name text not null,
 quantity integer not null check(quantity between 1 and 99),
 unit_grosz bigint not null check(unit_grosz>=0)
);
create index orders_store_created_idx on public.orders(store_id,created_at desc);
create index order_items_order_idx on public.order_items(order_id);
alter table public.stores enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
-- Deny all client access until authenticated admin roles and server API are implemented.
revoke all on public.stores,public.orders,public.order_items from anon,authenticated;
commit;
