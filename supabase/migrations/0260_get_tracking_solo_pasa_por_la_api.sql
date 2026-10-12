-- ============================================================================
-- 0260 — `get_tracking` deja de ser ejecutable por anon/authenticated (SEC-03)
-- ============================================================================
--
-- `get_tracking(text)` es SECURITY DEFINER y publica el seguimiento de un pedido
-- a quien tenga su `short_id`. Estaba concedida a `anon, authenticated`, así que
-- cualquiera con la clave anon la llamaba DIRECTO en PostgREST y se saltaba la
-- API, y con ella el límite de tasa por IP (`apps/api/lib/http/rate-limit.ts`,
-- cubo `tracking`). Desde ahora solo la ejecutan `service_role` (la API) y su
-- dueño `postgres`.
--
-- Inventario de consumidores (medido en el repo, 2026-10-11; `git grep get_tracking`
-- fuera de migraciones, rollbacks y Docs):
--   · apps/api/app/api/v1/public/orders/[shortId]/route.ts: único `.rpc('get_tracking')`,
--     con `createServiceClient()` (service_role). NO cambia.
--   · apps/customer, apps/negocios, apps/motorizados, apps/admin, packages/*, e2e,
--     supabase/functions: SOLO comentarios. La web del cliente lee su pedido por RLS
--     (`useTracking`) o por la API, nunca por esta RPC.
--   · packages/supabase/src/database.types.ts: el tipo generado; no es una llamada.
--   · Ninguna función SQL la llama (solo comentarios en 0186/0193/0196/0232/0233).
--   · packages/contracts/openapi: describe la RUTA de la API, que sigue igual.
--
-- Estado ANTES: anon y authenticated con EXECUTE (grant explícito de 0009/0100 y
-- recreaciones posteriores con `grant execute … to anon, authenticated`).
-- Para restaurar exacto:
--   grant execute on function public.get_tracking(text) to anon, authenticated;
--
-- Idempotente. Si una migración futura la recrea con `create or replace`, el ACL
-- se conserva; si la recrea con DROP, tiene que repetir este revoke.
-- ============================================================================

revoke execute on function public.get_tracking(text) from public, anon, authenticated;
grant execute on function public.get_tracking(text) to service_role;
-- postgres es el dueño: conserva EXECUTE por serlo.

-- ── Comprobación: si el permiso no quedó cerrado, la migración falla ─────────
do $check$
declare
  n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'get_tracking';
  if n <> 1 then
    raise exception '0260: se esperaba UNA sola get_tracking y hay %', n;
  end if;
  if has_function_privilege('anon', 'public.get_tracking(text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_tracking(text)', 'execute') then
    raise exception '0260: get_tracking sigue ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.get_tracking(text)', 'execute') then
    raise exception '0260: service_role perdió EXECUTE sobre get_tracking';
  end if;
end
$check$;
