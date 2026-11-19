-- ============================================================================
-- 0291 — el estado público de Entregas dice el peso máximo
-- ============================================================================
-- `GET /public/courier/status` no traía `courier.maxWeightKg`, y las apps escribían
-- «Hasta 5 kg» en sus textos. Ahora `courier_service_status()` devuelve además
-- `maxWeightKg` (decisión de Jesús, 2026-11-19; requisito CUS-ENT-003 y CA-ENT-11).
--
-- Aditiva: la misma forma de antes más una clave opcional. Una app instalada que no la
-- conoce la ignora (invariante 11). Sin dinero. Mismo SECURITY DEFINER y search_path
-- que la 0240. NO se vuelve a conceder EXECUTE: la 0261 se lo quitó a anon y
-- authenticated (la ruta usa service_role) y `create or replace` conserva los permisos.
-- Idempotente.
-- ============================================================================

create or replace function public.courier_service_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_enabled boolean;
begin
  select value into v_courier from public.app_settings where key = 'courier';
  v_enabled := coalesce((v_courier ->> 'enabled')::boolean, false);
  return jsonb_build_object(
    'enabled', v_enabled,
    'openNow', v_enabled and public.is_within_courier_schedule(),
    'hours', v_courier -> 'hours',
    'price', coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00),
    'pausedMessage', v_courier ->> 'pausedMessage'
  ) || case
    -- Sin el ajuste, o con uno que no es un número positivo (null, texto, cero), no se inventa un peso:
    -- la clave se omite y la app no muestra ninguno. Nunca falla el cast: Entregas no se cierra por un ajuste mal escrito.
    when jsonb_typeof(v_courier -> 'maxWeightKg') = 'number'
      and (v_courier ->> 'maxWeightKg')::numeric > 0
      then jsonb_build_object('maxWeightKg', (v_courier ->> 'maxWeightKg')::numeric)
    else '{}'::jsonb
  end;
end;
$$;
