-- ============================================================================
-- 0255 — Dos cierres de permisos: vencer entregas ajenas y teléfonos del directorio
-- ============================================================================
--
-- C1. `expire_courier_orders()` es SECURITY DEFINER y la 0232/0238 la concedieron
-- a `anon, authenticated`. Cualquiera con la clave anon podía cancelar las
-- solicitudes `requested` de todos. Solo la ejecutan el cron `expire-courier-orders`
-- (corre como `postgres`, dueño de la función) y `service_role`.
--
-- Estado ANTES (medido en tindivo-prod el 2026-10-11):
--   proacl = {=X/postgres,postgres=X/postgres,anon=X/postgres,
--             authenticated=X/postgres,service_role=X/postgres}
-- Para restaurar exacto:
--   grant execute on function public.expire_courier_orders() to public, anon, authenticated;
--
-- SEC-1. `directory_businesses` es legible por `anon`/`authenticated`
-- (`db_public_read`, visible_on_map) con grant de TABLA completo, así que `phone`
-- y `whatsapp` salían a cualquiera con la clave anon. RLS filtra filas, no
-- columnas: se retira el SELECT de tabla y se concede por columna (patrón 0217),
-- dejando fuera esas dos. Admin y API leen por service_role, que no cambia.
--
-- Estado ANTES: anon y authenticated con SELECT de tabla (más INSERT/UPDATE/
-- DELETE/etc., que NO se tocan: los frena RLS). Para restaurar:
--   grant select on table public.directory_businesses to anon, authenticated;
--
-- Inventario de tindivo-prod (solo lectura, 2026-10-11) que respalda esto:
--   · expire_courier_orders tiene UNA sola sobrecarga; has_function_privilege
--     era true para anon, authenticated, service_role y postgres.
--   · anon y authenticated no son miembros de ningún rol (sin herencia).
--   · directory_businesses.relacl = {postgres=arwdDxtm/postgres,
--     anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,
--     service_role=arwdDxtm/postgres}; nada para PUBLIC y SIN ACL por columna.
--   · cron: '* * * * *' | SELECT public.expire_courier_orders(); | postgres.
-- Restaurar SEC-1 exacto: grant select on public.directory_businesses to anon,
--   authenticated; y revocar los grants por columna de abajo
--   (revoke select (<columnas>) on public.directory_businesses from anon, authenticated).
--
-- Idempotente.
-- ============================================================================

-- ── C1 ──────────────────────────────────────────────────────────────────────
revoke execute on function public.expire_courier_orders() from public, anon, authenticated;
grant execute on function public.expire_courier_orders() to service_role;
-- postgres (cron) es el dueño: conserva EXECUTE por serlo.

-- ── SEC-1 ───────────────────────────────────────────────────────────────────
revoke select on table public.directory_businesses from anon, authenticated;

grant select (
  id,
  name,
  category,
  lat,
  lng,
  reference_text,
  opens_at,
  closes_at,
  cover_photo_url,
  visible_on_map,
  courier_enabled,
  is_partner,
  partner_business_id,
  has_menu_in_tindivo,
  works_with_zorritos,
  last_verified_at,
  created_at,
  updated_at,
  updated_by
) on table public.directory_businesses to anon, authenticated;
-- `phone` y `whatsapp` quedan fuera a propósito. Si alguna vez se conceden,
-- que sea en una migración que diga por qué.

-- ── Comprobación: si el permiso no quedó cerrado, la migración falla ─────────
do $check$
begin
  if has_function_privilege('anon', 'public.expire_courier_orders()', 'execute')
     or has_function_privilege('authenticated', 'public.expire_courier_orders()', 'execute') then
    raise exception '0255: expire_courier_orders sigue ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.expire_courier_orders()', 'execute') then
    raise exception '0255: service_role perdió EXECUTE sobre expire_courier_orders';
  end if;
  if has_column_privilege('anon', 'public.directory_businesses', 'phone', 'select')
     or has_column_privilege('authenticated', 'public.directory_businesses', 'whatsapp', 'select') then
    raise exception '0255: phone/whatsapp siguen legibles';
  end if;
  if not has_column_privilege('anon', 'public.directory_businesses', 'name', 'select') then
    raise exception '0255: anon perdió la lectura de name';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'expire-courier-orders' and username = 'postgres') then
    raise exception '0255: falta el cron expire-courier-orders de postgres';
  end if;
end
$check$;
