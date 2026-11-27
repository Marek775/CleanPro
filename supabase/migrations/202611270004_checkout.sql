begin;
create table drop_private.catalog (
 store_id text not null references public.stores(id),
 sku text not null,
 name text not null,
 unit_grosz bigint not null check(unit_grosz between 0 and 100000000),
 active boolean not null default false,
 primary key(store_id,sku)
);
insert into drop_private.catalog(store_id,sku,name,unit_grosz) values
 ('cleanpro','basic','CleanPro Basic',19900),
 ('cleanpro','plus','CleanPro Plus',24900),
 ('cleanpro','premium','CleanPro Premium',29900);
alter table drop_private.catalog enable row level security;
revoke all on drop_private.catalog from public,anon,authenticated;
create table drop_private.checkout_requests (
 request_id uuid primary key,
 store_id text not null,
 payload jsonb not null,
 order_id uuid references public.orders(id)
);
alter table drop_private.checkout_requests enable row level security;
revoke all on drop_private.checkout_requests from public,anon,authenticated;
create function public.drop_create_order(p_request_id uuid,p_store text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare existing drop_private.checkout_requests%rowtype;
 line jsonb; product drop_private.catalog%rowtype; qty integer;
 total bigint:=0; new_id uuid; seen text[]:=array[]::text[];
begin
 if p_request_id is null or p_store is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid request'; end if;
 if jsonb_array_length(p_items) not between 1 and 20 then raise exception 'Invalid item count'; end if;
 insert into drop_private.checkout_requests(request_id,store_id,payload) values(p_request_id,p_store,p_items) on conflict do nothing;
 select * into existing from drop_private.checkout_requests where request_id=p_request_id for update;
 if existing.store_id<>p_store or existing.payload<>p_items then raise exception 'Idempotency conflict'; end if;
 if existing.order_id is not null then return existing.order_id; end if;
 insert into public.orders(store_id,total_grosz) values(p_store,0) returning id into new_id;
 for line in select value from jsonb_array_elements(p_items) loop
 if jsonb_typeof(line)<>'object' or jsonb_typeof(line->'sku') is distinct from 'string' or jsonb_typeof(line->'quantity') is distinct from 'number' or coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Invalid item'; end if;
 qty:=(line->>'quantity')::integer;
 if (line->>'sku')=any(seen) then raise exception 'Duplicate SKU'; end if;
 seen:=array_append(seen,line->>'sku');
 select * into product from drop_private.catalog where store_id=p_store and sku=line->>'sku' and active for share;
 if not found then raise exception 'Unavailable product'; end if;
 total:=total+product.unit_grosz*qty;
 insert into public.order_items(order_id,sku,name,quantity,unit_grosz) values(new_id,product.sku,product.name,qty,product.unit_grosz);
 end loop;
 update public.orders set total_grosz=total where id=new_id;
 update drop_private.checkout_requests set order_id=new_id where request_id=p_request_id;
 return new_id;
end $$;
revoke all on function public.drop_create_order(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.drop_create_order(uuid,text,jsonb) to service_role;
-- Catalog remains inactive. No public checkout, delivery, discounts or payment processing yet.
commit;
