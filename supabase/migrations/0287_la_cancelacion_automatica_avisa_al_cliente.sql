-- ============================================================================
-- 0287 — la cancelación automática avisa: escribe el evento en el outbox
-- ============================================================================
-- `cancel_expired_prepay_orders` (última definición: 0220) cancelaba los pedidos
-- vencidos con un UPDATE y nada más: no escribía en `domain_events`. Resultado: ni
-- push al cliente ni consumidor alguno del outbox cuando el pg_cron (o el panel de
-- la cajera) ganaba la carrera al `expire_order` de Inngest. Rompía el invariante 4
-- (outbox en la MISMA transacción que el agregado).
--
-- Ahora cada pedido que cancela cualquiera de los cuatro bloques emite un
-- `OrderExpired` con `{"reason": <cancel_reason>}`, igual que `expire_order` (0061),
-- que ya lo emite para esos mismos cuatro motivos. Cada bloque recorre las filas que
-- el UPDATE ... RETURNING acaba de cancelar y escribe su evento con un
-- INSERT ... VALUES de motivo literal (la forma que el inventario de productores de
-- eventos de la prueba de borrado de cuenta sabe leer). Todo dentro de la misma
-- transacción de la función; solo emite para filas que de verdad pasaron a
-- `cancelled`, así que una segunda pasada no repite nada. Lo demás (reglas, notas,
-- relojes, retorno, SECURITY DEFINER, search_path y grants) es idéntico a 0220. Sin
-- cambios de dinero: el consumidor del evento (`send-push`) solo notifica.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_expired_prepay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_timers jsonb;
  v_acceptance int;
  v_payment int;
  v_validation int;
  v_verification int;
  v_c1 integer := 0;
  v_c2 integer := 0;
  v_c3 integer := 0;
  v_c4 integer := 0;
  v_id uuid;
BEGIN
  SELECT value INTO v_timers FROM public.app_settings WHERE key = 'timers';

  -- Los `coalesce` conservan los valores de DECISIONS §10 si la clave faltara.
  -- Son la red para una fila incompleta, no el sitio donde vive el número.
  v_acceptance   := coalesce((v_timers ->> 'acceptanceMinutes')::int, 5);
  v_payment      := coalesce((v_timers ->> 'paymentMinutes')::int, 15);
  v_validation   := coalesce((v_timers ->> 'validationMinutes')::int, 5);
  v_verification := coalesce((v_timers ->> 'prepayVerificationMinutes')::int, 10);

  -- 1 · El negocio no confirmó disponibilidad.
  -- Sin filtro por `payment_intent`: la ventana de aceptación es la misma para
  -- contraentrega y para prepago (los dos nacen aquí). Y desde 0220, la misma
  -- para un recojo: lo que cambia es la frase, no el reloj.
  FOR v_id IN
  WITH cancelled1 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'pending_acceptance_timeout',
        cancel_note = CASE
          WHEN delivery_method = 'pickup' AND pickup_timing = 'now' THEN format(
            'Auto-cancelado: nadie confirmó al cliente en el mostrador en %s minutos', v_acceptance)
          WHEN delivery_method = 'pickup' THEN format(
            'Auto-cancelado: el negocio no confirmó el recojo en %s minutos', v_acceptance)
          ELSE format(
            'Auto-cancelado: el negocio no confirmó disponibilidad en %s minutos', v_acceptance)
        END
    WHERE status = 'pending_acceptance'
      AND coalesce(pending_acceptance_at, created_at)
            <= now() - (v_acceptance * interval '1 minute')
    RETURNING id
  )
  SELECT id FROM cancelled1
  LOOP
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', v_id, 'OrderExpired', jsonb_build_object('reason', 'pending_acceptance_timeout'));
    v_c1 := v_c1 + 1;
  END LOOP;

  -- 2 · El cliente no pagó ni subió su captura.
  FOR v_id IN
  WITH cancelled2 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format('Auto-cancelado: pago no realizado en %s minutos', v_payment)
    WHERE status = 'awaiting_payment'
      AND coalesce(awaiting_payment_at, updated_at)
            <= now() - (v_payment * interval '1 minute')
    RETURNING id
  )
  SELECT id FROM cancelled2
  LOOP
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', v_id, 'OrderExpired', jsonb_build_object('reason', 'prepay_timeout'));
    v_c2 := v_c2 + 1;
  END LOOP;

  -- 3 · Validación humana de contraentrega.
  -- Excluye el prepago explícitamente en vez de por el rodeo de la 0159. Los
  -- bloques 3 y 4 son disjuntos: aquí NUNCA entra un prepago, y todo prepago
  -- en `validando` cae en el 4.
  FOR v_id IN
  WITH cancelled3 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'validation_timeout',
        cancel_note = format('Auto-cancelado: no se validó al cliente en %s minutos', v_validation)
    WHERE status = 'validando'
      AND payment_intent <> 'prepaid'
      AND (validation_context = 'antifraud' OR validation_context IS NULL)
      AND coalesce(validating_at, created_at)
            <= now() - (v_validation * interval '1 minute')
    RETURNING id
  )
  SELECT id FROM cancelled3
  LOOP
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', v_id, 'OrderExpired', jsonb_build_object('reason', 'validation_timeout'));
    v_c3 := v_c3 + 1;
  END LOOP;

  -- 4 · La cajera no revisó el comprobante.
  FOR v_id IN
  WITH cancelled4 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format(
          'Auto-cancelado: validación del comprobante no completada en %s minutos', v_verification)
    WHERE status = 'validando'
      AND (validation_context = 'proof' OR payment_intent = 'prepaid')
      AND coalesce(validating_at, created_at)
            <= now() - (v_verification * interval '1 minute')
    RETURNING id
  )
  SELECT id FROM cancelled4
  LOOP
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', v_id, 'OrderExpired', jsonb_build_object('reason', 'prepay_timeout'));
    v_c4 := v_c4 + 1;
  END LOOP;

  -- NO HAY BLOQUE 5 PARA `ready_for_pickup`, Y ES DELIBERADO. Una bolsa en el
  -- mostrador no se cancela sola: la comida ya está hecha y pagada o por pagar,
  -- y borrarla de la pantalla sin que nadie mire es perder el único momento en
  -- que se puede decidir si el cliente se llevó su pedido, si hay que guardarlo,
  -- o si merece un strike. Esa decisión la toma la cajera con `pickup_no_show`.
  RETURN v_c1 + v_c2 + v_c3 + v_c4;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_expired_prepay_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders() TO service_role;
