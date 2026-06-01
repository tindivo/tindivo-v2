-- =============================================================================
-- 0008 · Hardening (resuelve advisors de seguridad de Supabase)
-- Idempotente.
-- =============================================================================

-- ERROR security_definer_view: la vista pública se reemplaza por un endpoint
-- de apps/api (service_role). Eliminar la vista de la superficie expuesta.
drop view if exists public.businesses_public;

-- WARN function_search_path_mutable: la única función sin search_path fijo.
alter function public.derive_business_primary_capability(boolean, boolean, boolean, boolean)
  set search_path = '';

-- WARN *_security_definer_function_executable: sacar de la superficie RPC pública
-- (PostgREST) las funciones que son SOLO triggers. Los triggers se disparan sin
-- necesidad de EXECUTE, así que revocar a public no rompe nada.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.log_order_status_change() from public;
revoke execute on function public.update_business_balance() from public;
revoke execute on function public.decrement_balance_on_payment() from public;
revoke execute on function public.update_business_primary_capability() from public;
revoke execute on function public.update_assigned_at() from public;
revoke execute on function public.orders_before_write() from public;
revoke execute on function public.touch_updated_at() from public;

-- generate_short_id la llama orders_before_write ejecutándose como service_role.
revoke execute on function public.generate_short_id() from public;
grant execute on function public.generate_short_id() to service_role;

-- current_user_role no se usa en ninguna policy: fuera de la superficie pública.
revoke execute on function public.current_user_role() from public;
grant execute on function public.current_user_role() to service_role;

-- Helpers de RLS: solo authenticated (y service_role) los necesita; anon no.
revoke execute on function public.current_user_has_role(public.user_role) from public;
grant execute on function public.current_user_has_role(public.user_role) to authenticated, service_role;
revoke execute on function public.current_business_id() from public;
grant execute on function public.current_business_id() to authenticated, service_role;
revoke execute on function public.current_driver_id() from public;
grant execute on function public.current_driver_id() to authenticated, service_role;

-- is_published_business: anon lo necesita (policies públicas de menú/horario).
-- get_tracking: RPC público intencional (tracking por short_id).
-- Ambas permanecen accesibles a anon (WARN intencional y documentado).
