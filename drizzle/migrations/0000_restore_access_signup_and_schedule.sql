GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT INSERT ON public.audit_log, public.payments, public.purchase_items, public.sale_items, public.stock_movements TO authenticated;
GRANT UPDATE ON public.profiles, public.settings TO authenticated;
GRANT INSERT, UPDATE ON public.sales TO authenticated;
GRANT INSERT ON public.report_insights TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories, public.customers, public.expenses, public.products, public.purchases, public.sales_returns, public.sales_return_items, public.stock_take_items, public.stock_take_sessions, public.suppliers, public.user_roles TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nightly-daily-report';
SELECT cron.schedule('nightly-daily-report', '10 21 * * *',
  $$select public.build_daily_report(((now() at time zone 'africa/nairobi')::date - 1), 'scheduled')$$);