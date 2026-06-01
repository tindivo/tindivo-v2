-- =============================================================================
-- 0009 · Endurecer la superficie RPC (grants de funciones)
-- Supabase otorga EXECUTE a anon/authenticated explícitamente (default privileges),
-- así que hay que revocar de esos roles, no solo de public.
-- Idempotente.
-- =============================================================================

-- Funciones que son SOLO triggers (no se llaman vía RPC). Los triggers se
-- disparan sin EXECUTE; quitarlas de anon/authenticated cierra la superficie API.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.log_order_status_change() from anon, authenticated;
revoke execute on function public.update_business_balance() from anon, authenticated;
revoke execute on function public.decrement_balance_on_payment() from anon, authenticated;
revoke execute on function public.update_business_primary_capability() from anon, authenticated;
revoke execute on function public.update_assigned_at() from anon, authenticated;
revoke execute on function public.orders_before_write() from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated;

-- generate_short_id: solo la llama orders_before_write como service_role.
revoke execute on function public.generate_short_id() from anon, authenticated;

-- current_user_role: no se usa en ninguna policy.
revoke execute on function public.current_user_role() from anon, authenticated;

-- Helpers de RLS: anon NO los usa (solo authenticated). is_published_business y
-- get_tracking SÍ los necesita anon (policies públicas / tracking) y permanecen.
revoke execute on function public.current_user_has_role(public.user_role) from anon;
revoke execute on function public.current_business_id() from anon;
revoke execute on function public.current_driver_id() from anon;
