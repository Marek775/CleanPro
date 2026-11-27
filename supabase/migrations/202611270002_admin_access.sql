begin;
create schema if not exists drop_private;
revoke all on schema drop_private from public, anon, authenticated;
create table drop_private.admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table drop_private.admins enable row level security;
revoke all on drop_private.admins from public, anon, authenticated;
create function public.drop_is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists(select 1 from drop_private.admins where user_id = auth.uid()) $$;
revoke all on function public.drop_is_admin() from public, anon;
grant execute on function public.drop_is_admin() to authenticated;
grant select on public.stores, public.orders, public.order_items to authenticated;
create policy admin_read_stores on public.stores for select to authenticated using ((select public.drop_is_admin()));
create policy admin_read_orders on public.orders for select to authenticated using ((select public.drop_is_admin()));
create policy admin_read_items on public.order_items for select to authenticated using ((select public.drop_is_admin()));
-- No client write privileges. Admin membership is provisioned by trusted database operators only.
commit;
