-- ROLLBACK de 0168 — el cliente vuelve a tener diez minutos para pagar.
--
-- Devuelve el bloque 2 (`awaiting_payment`) de cancel_expired_prepay_orders a
-- `interval '10 minutes'` y `app_settings.timers.paymentMinutes` a 10. Los
-- bloques 1 (pending_acceptance, 5 min) y 3 (validando, 10 min) nunca cambiaron.
--
-- Los dos sitios se revierten JUNTOS: si solo se baja el intervalo de la función,
-- el cron mata pedidos a los 10 minutos mientras Inngest y los relojes del
-- frontend siguen prometiendo 15.

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

  -- 2. Cancelar pedidos en awaiting_payment vencidos (> 10 min)
  WITH cancelled2 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = 'Auto-cancelado: pago no realizado en 10 minutos'
    WHERE status = 'awaiting_payment'
      AND (
        (awaiting_payment_at IS NOT NULL AND awaiting_payment_at <= now() - interval '10 minutes')
        OR (awaiting_payment_at IS NULL AND updated_at <= now() - interval '10 minutes')
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

UPDATE public.app_settings
SET value = jsonb_set(value, '{paymentMinutes}', '10'::jsonb, true)
WHERE key = 'timers';
