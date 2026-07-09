
revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.current_user_roles() from public, anon;
revoke execute on function public.process_sale(jsonb) from public, anon;
revoke execute on function public.process_purchase(jsonb) from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.tg_stock_apply() from public, anon;
revoke execute on function public.tg_set_updated_at() from public, anon;
