-- =============================================================================
-- 0168 · El cliente tiene quince minutos para pagar, no diez
-- =============================================================================
--
-- QUÉ CAMBIA Y POR QUÉ
-- La ventana de `awaiting_payment` —desde que el negocio confirma disponibilidad
-- hasta que el cliente transfiere por Yape/Plin y adjunta la captura— pasa de 10
-- a 15 minutos. Diez no alcanzaban: el cliente tiene que salir de la app, abrir
-- su billetera, pagar, volver y subir la foto.
--
-- QUÉ **NO** CAMBIA
-- La ventana de `validando` (la cajera revisando la captura ya subida) sigue en
-- 10 minutos, y la de `pending_acceptance` en 5. Son tres relojes distintos que
-- se confunden con facilidad porque los tres cancelan con `prepay_timeout`:
--   · bloque 1 · pending_acceptance · 5 min  · el negocio no respondió
--   · bloque 2 · awaiting_payment   · 15 min · EL CLIENTE no pagó   ← el único que cambia
--   · bloque 3 · validando          · 10 min · la cajera no validó
--
-- EL NÚMERO VIVE EN DOS SITIOS
-- El intervalo está hardcodeado en esta función (que es lo que ejecuta el
-- pg_cron `auto-cancel-prepay-timeout`, programado en 0098 y que NO se toca
-- aquí: sigue invocando el RPC) y además en `app_settings.timers.paymentMinutes`,
-- que es lo que lee el Inngest `order-payment-timeout`. Los dos tienen que decir
-- lo mismo o el cron mata el pedido antes de que Inngest despierte.
--
-- `paymentMinutes` no lo envía el formulario del panel admin (va en MERGED_KEYS,
-- ver apps/api/app/api/v1/admin/settings/route.ts), así que este valor no se lo
-- lleva un "Guardar tiempos". `prepayVerificationMinutes` sí es editable desde
-- ahí, y por eso no se toca por migración.
--
-- REVERSIBILIDAD: supabase/rollbacks/0168_the_customer_gets_fifteen_minutes_to_pay.rollback.sql

CREATE OR REPLACE FUNCTION public.cancel_expired_prepay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer := 0;
  v_c1 integer := 0;
  v_c2 integer := 0;
  v_c3 integer := 0;
BEGIN
  -- 1. Cancelar pedidos en pending_acceptance vencidos (> 5 min)
  WITH cancelled1 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = 'Auto-cancelado: el restaurante no respondió en 5 minutos'
    WHERE status = 'pending_acceptance'
      AND (
        (pending_acceptance_at IS NOT NULL AND pending_acceptance_at <= now() - interval '5 minutes')
        OR (pending_acceptance_at IS NULL AND created_at <= now() - interval '5 minutes')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_c1 FROM cancelled1;

  -- 2. Cancelar pedidos en awaiting_payment vencidos (> 15 min)
  WITH cancelled2 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = 'Auto-cancelado: pago no realizado en 15 minutos'
    WHERE status = 'awaiting_payment'
      AND (
        (awaiting_payment_at IS NOT NULL AND awaiting_payment_at <= now() - interval '15 minutes')
        OR (awaiting_payment_at IS NULL AND updated_at <= now() - interval '15 minutes')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_c2 FROM cancelled2;

  -- 3. Cancelar pedidos en validando vencidos (> 10 min)
  WITH cancelled3 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = 'Auto-cancelado: validación no completada en 10 minutos'
    WHERE status = 'validando'
      AND (
        (validating_at IS NOT NULL AND validating_at <= now() - interval '10 minutes')
        OR (validating_at IS NULL AND created_at <= now() - interval '10 minutes')
      )
    RETURNING id
  )
  SELECT count(*) INTO v_c3 FROM cancelled3;

  v_count := v_c1 + v_c2 + v_c3;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders() TO anon, authenticated, service_role;

-- El valor que lee Inngest, alineado con el intervalo de arriba.
UPDATE public.app_settings
SET value = jsonb_set(value, '{paymentMinutes}', '15'::jsonb, true)
WHERE key = 'timers';
