-- =============================================================================
-- 0181 · La cajera confirma que la plata ya cayó
-- =============================================================================
--
-- QUÉ CAMBIA
--   `validate_order` acepta un pedido en `awaiting_payment` (prepago, todavía
--   sin comprobante) y lo manda derecho a `preparing`, marcando el pago como
--   verificado. Antes solo admitía `validando`.
--
-- POR QUÉ
--   El prepago obliga hoy a un rodeo: el cliente yapea, la cajera VE la plata
--   en su propio teléfono, y aun así el pedido se queda parado hasta que el
--   cliente encuentre la captura, la suba, y la cajera la mire. Son dos
--   personas esperando por una foto de algo que las dos ya saben. Y el reloj
--   de `paymentMinutes` sigue corriendo mientras tanto: si el cliente no
--   acierta a subir la captura en 15 minutos, el barrido de
--   `cancel_expired_prepay_orders` (bloque 2) cancela un pedido YA PAGADO.
--   Ese es el caso que esto cierra.
--
--   La cajera es la misma persona que ya sostiene el antifraude del piloto
--   (CLAUDE.md: «antifraude HUMANO, la cajera llama»). Confirmar contra su
--   propia cuenta de Yape/Plin no es un atajo: es la misma verificación sin el
--   intermediario de la captura.
--
-- QUÉ **NO** CAMBIA
--   · El camino con comprobante (`validando` → `preparing`) queda intacto,
--     línea por línea.
--   · La firma de la función y sus permisos.
--   · `OrderProofVerified` sigue siendo auditoría: `dispatch_event` (0134) no
--     lo tiene en su lista blanca, así que no viaja como push. El cliente se
--     entera por su tracking, igual que en el camino con captura.
--
-- DECISIONES DEL BLOQUE NUEVO
--
-- (a) SOLO `p_pass = true`. En `awaiting_payment` no hay comprobante, así que
--     no hay nada que rechazar: lo que existe es cancelar el pedido, y de eso
--     ya se encarga `advance_order`. Un `p_pass = false` aquí levanta P0001 en
--     vez de devolver `ok:false`, y no es cosmético: el route handler reacciona
--     a `status = 'awaiting_payment'` en la respuesta reemitiendo el evento de
--     timeout de pago, o sea que un retorno silencioso le REGALARÍA al cliente
--     15 minutos nuevos de reloj sin que nadie los pidiera.
--
-- (b) EL TIEMPO DE COCCIÓN QUE ELIGE LA CAJERA MANDA:
--         COALESCE(p_prep_time_minutes, orders.prep_time_minutes, 20)
--     y no al revés. El valor guardado en `orders` lo puso `advance_order` al
--     aceptar disponibilidad, donde el panel manda un 20 fijo que nadie
--     escogió (`pedido-detail.tsx`: `actions.onAccept(20)` en el prepago). El
--     minuto que la cajera elige AHORA, con la comanda delante, es mejor dato
--     que ese 20 por defecto.
--
--     OJO: la rama 'proof' de más abajo lo resuelve al revés
--     (`COALESCE(orders.prep_time_minutes, v_prep)`), así que ahí el modal de
--     tiempo es decorativo. Es un defecto anterior a esta migración y se deja
--     como está: cambiarlo mueve el reloj de un camino que hoy funciona, y esa
--     es una decisión aparte de esta.
--
-- (c) NO se toca `comprobante_prepago_url` ni `proof_attempt`. No hubo
--     captura; inventar una fila que diga lo contrario haría mentir al panel
--     de admin. `payment_verified_by` deja el rastro de quién respondió.
--
-- REVERSIBILIDAD: supabase/rollbacks/0181_the_cashier_confirms_the_money_already_landed.rollback.sql

CREATE OR REPLACE FUNCTION public.validate_order(p_order_id uuid, p_actor_user_id uuid, p_actor_role user_role, p_pass boolean, p_reason text DEFAULT NULL::text, p_reason_code text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_context text;
  v_prep int;
BEGIN
  -- Tiempo de cocción elegido por la cajera. Acotado igual que en advance_order.
  v_prep := greatest(1, COALESCE(p_prep_time_minutes, 20));
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;
  -- `awaiting_payment` entra desde la 0181: la cajera confirma contra su cuenta.
  IF v_order.status NOT IN ('validando', 'awaiting_payment') THEN
    RETURN jsonb_build_object('ok', false, 'status', v_order.status);
  END IF;

  IF p_actor_role = 'business' THEN
    SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;
    IF v_business.user_id <> p_actor_user_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
  ELSIF p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo el negocio o admin validan' USING errcode = 'P0001';
  END IF;

  -- ===========================================================================
  -- CONFIRMACIÓN DIRECTA DEL PREPAGO (0181)
  -- El pedido sigue esperando la captura, pero el negocio ya vio el dinero en
  -- su cuenta. Se salta `validando` entero: no hay comprobante que revisar.
  -- ===========================================================================
  IF v_order.status = 'awaiting_payment' THEN
    IF v_order.payment_intent <> 'prepaid' THEN
      -- No debería existir: solo el prepago pasa por `awaiting_payment`.
      RETURN jsonb_build_object('ok', false, 'status', v_order.status);
    END IF;
    IF NOT p_pass THEN
      RAISE EXCEPTION 'Sin comprobante no hay nada que rechazar: cancela el pedido' USING errcode = 'P0001';
    END IF;

    -- El minuto que la cajera acaba de elegir gana al que se guardó al aceptar.
    v_prep := greatest(1, COALESCE(p_prep_time_minutes, v_order.prep_time_minutes, 20));

    UPDATE public.orders
      SET status = 'preparing',
          prep_time_minutes   = v_prep,
          estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
          payment_proof_status = 'verified',
          payment_verified_at  = now(),
          payment_verified_by  = p_actor_user_id
      WHERE id = p_order_id;

    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderProofVerified', jsonb_build_object(
      'shortId', v_order.short_id, 'context', 'direct_business_verification'));
    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.payment_confirmed_direct', p_actor_role::text, p_actor_user_id,
      jsonb_build_object('context', 'direct_business_verification', 'prepTimeMinutes', v_prep));

    RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'direct_business_verification');
  END IF;

  -- Determinar el contexto: usar la columna explícita, o deducir de proof_attempt
  -- (backward-compat para órdenes que entraron a validando antes de esta migración)
  v_context := COALESCE(v_order.validation_context,
    CASE WHEN v_order.proof_attempt >= 1 THEN 'proof' ELSE 'antifraud' END);

  IF p_pass THEN
    -- =========================================================================
    -- RAMA PASS = TRUE
    -- =========================================================================
    IF v_context = 'proof' THEN
      -- CASO A: Verificación de comprobante real (proof_attempt >= 1).
      -- El cliente subió un voucher de Yape/Plin → la cajera lo revisa y aprueba.
      -- Transición: validando → preparing + payment_proof_status = 'verified'.
      -- Es el instante exacto en que la cocina empieza: aquí arranca el reloj.
      UPDATE public.orders
        SET status = 'preparing',
            -- El reloj arranca al verificar el pago, no antes.
            prep_time_minutes   = COALESCE(v_order.prep_time_minutes, v_prep),
            estimated_ready_at  = now() + (COALESCE(v_order.prep_time_minutes, v_prep) || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, COALESCE(v_order.prep_time_minutes, v_prep) - public.queue_lead_minutes()) || ' minutes')::interval,
            payment_proof_status = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'verified' ELSE payment_proof_status END,
            payment_verified_at  = CASE WHEN v_order.payment_intent = 'prepaid' THEN now() ELSE payment_verified_at END,
            payment_verified_by  = CASE WHEN v_order.payment_intent = 'prepaid' THEN p_actor_user_id ELSE payment_verified_by END
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderProofVerified', jsonb_build_object('shortId', v_order.short_id));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.proof_verified', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('context', 'proof'));

      RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'proof');

    ELSE
      -- CASO B: Antifraude — validación por llamada (proof_attempt = 0).
      -- La cajera llamó al cliente para verificar que el pedido es legítimo.
      -- NO hay comprobante de pago de por medio.
      -- Ramificar por payment_intent para decidir el siguiente estado.
      IF v_order.payment_intent = 'prepaid' THEN
        -- Prepago: soltar el hold de antifraude y volver a pending_acceptance.
        -- El pedido sigue su curso normal: accept → awaiting_payment → pago → verificar.
        -- NO marcar payment_proof_status = 'verified' (no se ha verificado ningún pago).
        UPDATE public.orders
          SET status = 'pending_acceptance'
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', 'prepaid', 'nextStatus', 'pending_acceptance'));

        RETURN jsonb_build_object('ok', true, 'status', 'pending_acceptance', 'context', 'antifraud');

      ELSE
        -- Contraentrega (pending_cash / pending_wallet / pending_mixed):
        -- La cajera ya validó por teléfono → saltar pending_acceptance y confirmed,
        -- directo a preparing en la misma transacción.
        UPDATE public.orders
          SET status = 'preparing',
              prep_time_minutes   = v_prep,
              estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
              appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', v_order.payment_intent, 'nextStatus', 'preparing'));

        RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'antifraud');
      END IF;
    END IF;

  ELSE
    -- =========================================================================
    -- RAMA PASS = FALSE (rechazo)
    -- =========================================================================
    IF v_context = 'proof' AND v_order.payment_intent = 'prepaid' AND v_order.proof_attempt < 2 THEN
      -- Rechazo de comprobante con reintento permitido (attempt 1 de 2).
      -- Vuelve a awaiting_payment para que el cliente suba otro comprobante.
      UPDATE public.orders
        SET status = 'awaiting_payment',
            payment_proof_status = 'rejected',
            rejection_reason_code = COALESCE(NULLIF(p_reason_code, ''), 'invalid_proof'),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail_retry', 'status', 'awaiting_payment'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed_retry', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code, 'attempt', v_order.proof_attempt, 'context', 'proof'));

      RETURN jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'outcome', 'retry_allowed', 'context', 'proof');

    ELSE
      -- Rechazo definitivo: cancelar el pedido.
      -- - proof context + prepaid + proof_attempt >= 2 → proof_rejected_final
      -- - proof context + no prepaid → business_cancelled
      -- - antifraud context → business_cancelled (la cajera no pudo validar)
      UPDATE public.orders
        SET status = 'cancelled',
            cancel_reason = CASE
              WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'proof_rejected_final'::public.cancel_reason
              ELSE 'business_cancelled'::public.cancel_reason
            END,
            cancelled_by = p_actor_user_id,
            cancel_note = p_reason,
            payment_proof_status = CASE
              WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'rejected' ELSE payment_proof_status
            END,
            rejection_reason_code = COALESCE(NULLIF(p_reason_code, ''),
              CASE WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'invalid_proof' ELSE NULL END),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail', 'status', 'cancelled'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code, 'context', v_context));

      RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'outcome', 'cancelled_final', 'context', v_context);
    END IF;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text, integer)
  TO service_role;
