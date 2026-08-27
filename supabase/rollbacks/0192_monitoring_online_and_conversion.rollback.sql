-- Rollback para 0192_monitoring_online_and_conversion.sql

drop function if exists public.admin_online_orders_stats(date, date);
drop function if exists public.admin_conversion_opportunity_stats();
