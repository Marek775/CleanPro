-- Run as trusted SQL operator in staging only, after migrations 001-004.
-- All test changes roll back. Never run against production.
begin;
update drop_private.catalog set active=true where store_id='cleanpro' and sku='plus';
do $$
declare req uuid:=gen_random_uuid(); first_id uuid; second_id uuid; amount bigint; item_count bigint; rejected boolean;
begin
 first_id:=public.drop_create_order(req,'cleanpro','[{"sku":"plus","quantity":2}]'::jsonb);
 second_id:=public.drop_create_order(req,'cleanpro','[{"sku":"plus","quantity":2}]'::jsonb);
 if first_id is distinct from second_id then raise exception 'Idempotency failed'; end if;
 select total_grosz into amount from public.orders where id=first_id;
 if amount is distinct from 49800 then raise exception 'Canonical price failed'; end if;
 select count(*) into item_count from public.order_items where order_id=first_id;
 if item_count<>1 then raise exception 'Duplicate order item'; end if;
 rejected:=false;
 begin
 perform public.drop_create_order(req,'cleanpro','[{"sku":"plus","quantity":3}]'::jsonb);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Conflicting retry accepted'; end if;
 rejected:=false;
 begin
 perform public.drop_create_order(gen_random_uuid(),'cleanpro','[{"sku":"nonexistent","quantity":1}]'::jsonb);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Unknown SKU accepted'; end if;
 rejected:=false;
 begin
 perform public.drop_create_order(gen_random_uuid(),'cleanpro','[{"sku":"plus","quantity":0}]'::jsonb);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Invalid quantity accepted'; end if;
 if has_function_privilege('anon','public.drop_create_order(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.drop_create_order(uuid,text,jsonb)','EXECUTE') then raise exception 'Unexpected client permission'; end if;
 raise notice 'Checkout smoke checks passed';
end $$;
rollback;
