-- ============================================================================
-- 0261 — 12 funciones SECURITY DEFINER que ningún cliente usa pierden EXECUTE
-- ============================================================================
--
-- Inventario de exposición (2026-10-13, base local en 0260): 26 funciones
-- SECURITY DEFINER de `public` eran ejecutables por `anon` o `authenticated`
-- directo en PostgREST. Estas 12 no las llama ningún cliente con esos roles:
-- las usa la API con `service_role` o las llaman otras funciones SQL (definer,
-- que se ejecutan con los permisos de su dueño y no necesitan el EXECUTE del rol).
--
--   Función                                      Revoca de
--   -------------------------------------------  ---------------------
--   current_service_date(timestamptz)            anon
--   effective_max_change(uuid)                   anon
--   get_courier_tracking(text)                   anon   (*)
--   courier_service_status()                     anon, authenticated
--   courier_has_available_driver()               anon, authenticated (código muerto)
--   delivery_band_for_point(numeric, numeric)    anon, authenticated
--   get_order_intake_status(timestamptz)         anon, authenticated
--   is_within_courier_schedule()                 anon, authenticated
--   is_within_order_intake_window(timestamptz)   anon, authenticated
--   point_in_coverage_polygon(numeric, numeric) anon, authenticated
--   current_customer_contraentrega_outcome(
--     double precision, double precision, text)  authenticated (anon ya no)
--   queue_lead_minutes()                         authenticated (anon ya no)
--
--   (*) `get_courier_tracking` SOLO pierde `anon`. `authenticated` la conserva
--       porque la web del cliente la llama con sesión
--       (apps/customer/lib/active-courier-orders.ts), pero así puede leer
--       CUALQUIER short_id: esa fuga se audita aparte. No se toca su cuerpo.
--
-- Las que conservan `authenticated` lo hacen porque un cliente con sesión las
-- llama: current_service_date (apps/negocios use-opening-day), effective_max_change
-- (apps/customer use-checkout-state y quote/route.ts con el JWT del usuario).
--
-- Estado ANTES (para restaurar exacto):
--   grant execute on function <firma> to anon, authenticated;
--
-- Idempotente: REVOKE sobre un permiso que no existe no falla. Si una migración
-- futura recrea una de estas con DROP + CREATE, los default privileges de Supabase
-- devuelven EXECUTE a anon y authenticated: tiene que repetir su revoke.
-- ============================================================================

-- Solo anon (authenticated se mantiene)
revoke execute on function public.current_service_date(timestamptz) from public, anon;
revoke execute on function public.effective_max_change(uuid) from public, anon;
revoke execute on function public.get_courier_tracking(text) from public, anon;

-- anon y authenticated
revoke execute on function public.courier_service_status() from public, anon, authenticated;
revoke execute on function public.courier_has_available_driver() from public, anon, authenticated;
revoke execute on function public.delivery_band_for_point(numeric, numeric) from public, anon, authenticated;
revoke execute on function public.get_order_intake_status(timestamptz) from public, anon, authenticated;
revoke execute on function public.is_within_courier_schedule() from public, anon, authenticated;
revoke execute on function public.is_within_order_intake_window(timestamptz) from public, anon, authenticated;
revoke execute on function public.point_in_coverage_polygon(numeric, numeric) from public, anon, authenticated;

-- Solo authenticated (anon ya no la tenía)
revoke execute on function public.current_customer_contraentrega_outcome(double precision, double precision, text) from public, anon, authenticated;
revoke execute on function public.queue_lead_minutes() from public, anon, authenticated;

-- ── Comprobación: si queda algún permiso abierto, o se cierra de más, falla ──
do $check$
declare
  f text;
  solo_anon text[] := array[
    'public.current_service_date(timestamptz)',
    'public.effective_max_change(uuid)',
    'public.get_courier_tracking(text)'
  ];
  ambos text[] := array[
    'public.courier_service_status()',
    'public.courier_has_available_driver()',
    'public.delivery_band_for_point(numeric, numeric)',
    'public.get_order_intake_status(timestamptz)',
    'public.is_within_courier_schedule()',
    'public.is_within_order_intake_window(timestamptz)',
    'public.point_in_coverage_polygon(numeric, numeric)',
    'public.current_customer_contraentrega_outcome(double precision, double precision, text)',
    'public.queue_lead_minutes()'
  ];
begin
  foreach f in array solo_anon loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception '0261: % sigue ejecutable por anon', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception '0261: % perdió EXECUTE de authenticated y un cliente la usa', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception '0261: % perdió EXECUTE de service_role', f;
    end if;
  end loop;

  foreach f in array ambos loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      raise exception '0261: % sigue ejecutable por anon o authenticated', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception '0261: % perdió EXECUTE de service_role', f;
    end if;
  end loop;
end
$check$;
