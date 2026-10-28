-- Restore Data API privileges for the restored schema
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Write privileges matching each table's policies
GRANT INSERT ON public.audit_log TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.purchase_items TO authenticated;
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT SELECT, INSERT ON public.report_insights TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.categories, public.customers, public.expenses, public.products,
  public.purchases, public.sales_returns, public.sales_return_items,
  public.stock_take_items, public.stock_take_sessions, public.suppliers TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Recreate the signup trigger that creates a profile and assigns a role for each new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Nightly automatic daily report at 00:10 Nairobi time (21:10 UTC), covering the day that just ended
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nightly-daily-report';
SELECT cron.schedule(
  'nightly-daily-report',
  '10 21 * * *',
  $cmd$ select public.build_daily_report(((now() at time zone 'africa/nairobi')::date - 1), 'scheduled') $cmd$
);