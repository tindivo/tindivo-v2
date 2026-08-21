-- ROLLBACK de 0174 — vuelven los cuatro relojes clavados y los tres cron en
-- paralelo, tal como estaban tras la 0168/0159.
--
-- OJO CON LO QUE SE REVIERTE
-- No es solo estética. Volver aquí devuelve los tres defectos que la 0174
-- corrigió, y dos de ellos son visibles para el cliente:
--
--   · `app_settings.timers` vuelve a ser decorativo. Si alguien ya cambió un
--     valor desde /admin, la base dejará de respetarlo Y el contador del
--     seguimiento (0172) seguirá enseñándolo: el cliente vería un plazo que la
--     base no cumple.
--   · Vuelve la carrera de `pending_acceptance`, y con ella el «Se acabó el
--     tiempo para pagar» a un cliente al que nadie dejó pagar.
--   · Vuelve el filtro `validation_context = 'call'`, imposible por el CHECK.
--
-- Si hay que revertir, revierte también la 0172 (los contadores del cliente).

CREATE OR REPLACE FUNCTION public.cancel_expired_prepay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_count integer := 0;
  v_c1 integer := 0;
  v_c2 integer := 0;
  v_c3 integer := 0;
BEGIN
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
$fn$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders() TO anon, authenticated, service_role;

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auto-cancel-pending-acceptance', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'pending_acceptance_timeout',
          cancel_note = 'Auto-cancelado: el negocio no aceptó disponibilidad en 5 minutos'
      WHERE status = 'pending_acceptance'
        AND pending_acceptance_at IS NOT NULL
        AND pending_acceptance_at < now() - interval '5 minutes';
    $cron$);

    PERFORM cron.schedule('auto-cancel-validando', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'validation_timeout',
          cancel_note = 'Auto-cancelado: no se validó al cliente en 5 minutos'
      WHERE status = 'validando'
        AND (validation_context = 'call' OR (validation_context IS NULL AND payment_intent <> 'prepaid'))
        AND validating_at IS NOT NULL
        AND validating_at < now() - interval '5 minutes';
    $cron$);

    PERFORM cron.schedule('auto-cancel-prepay-validation-timeout', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'prepay_timeout',
          cancel_note = 'Auto-cancelado: validación no completada en 10 minutos'
      WHERE status = 'validando'
        AND (validation_context = 'proof' OR payment_intent = 'prepaid')
        AND validating_at IS NOT NULL
        AND validating_at < now() - interval '10 minutes';
    $cron$);
  END IF;
END
$mig$;
