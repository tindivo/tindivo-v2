-- =============================================================================
-- 0225 · La ventana de la cola no se abre para el mostrador
--
-- Idempotente (CREATE OR REPLACE). Rollback en
-- supabase/rollbacks/0225_the_queue_window_does_not_open_for_the_counter.rollback.sql
-- =============================================================================
--
-- EL DEFECTO
-- `advance_order` se toma la molestia de escribir NULL en `appears_in_queue_at`
-- cuando el pedido es un recojo, y lo dice con todas las letras:
--
--     appears_in_queue_at = CASE
--       WHEN v_order.delivery_method = 'pickup' THEN NULL
--       ELSE now() + (...)
--     END
--     -- NULL ahi significa «la ventana nunca se abre», que es exactamente lo
--     -- que se quiere (0220).
--
-- `validate_order` no lo hacia en NINGUNA de sus tres rutas a `preparing`, asi
-- que un recojo que llega a cocina POR AHI —y hay uno que solo puede llegar por
-- ahi: el «mas tarde», que va prepagado y entra a cocina cuando la cajera
-- aprueba la captura— salia de la validacion con una ventana de cola abierta.
--
-- Medido en la base local el 2026-09-10 recorriendo el ciclo entero de un
-- recojo «mas tarde» prepagado: tras `validate_order` el pedido quedaba en
-- `preparing` con `appears_in_queue_at = now() + 10 min`.
--
-- POR QUE NO ERA UN INCIDENTE, Y AUN ASI SE ARREGLA
-- Hoy no lo ve ningun motorizado: la policy `ord_driver_read` exige
-- `delivery_method = 'delivery'`, asi que la fila nunca sale en su tablero por
-- mucho que la ventana este abierta. Es la misma forma que el invariante 8 de
-- CLAUDE.md — codigo inalcanzable porque OTRA capa lo tapa, no porque este
-- bien— y el mismo motivo para arreglarlo: la RLS es lo unico que separa un
-- recojo prepagado de aparecer como tomable en la cola, y quien toque esa
-- policy manana no tiene forma de saber que la esta sosteniendo.
--
-- Las tres rutas se arreglan y no solo la del prepago. Las otras dos son hoy
-- inalcanzables para un recojo, pero dejar dos de tres es dejar la trampa
-- puesta para el dia en que dejen de serlo.
--
-- COMO SE GENERO ESTE CUERPO
-- No esta escrito a mano. Se extrae el VIVO —verificado byte a byte contra
-- `tindivo-prod`, md5 c9d75c3e19b0cb05e6598438c2d82297, 12175 caracteres— y se
-- le aplican tres sustituciones ancladas con `scratch/build-0225-cola.mjs`, que
-- aborta si un anclaje no aparece exactamente una vez o si cambia una sola de
-- las 210 lineas que no toca. Mismo metodo y mismo motivo que la 0189, cuya
-- cabecera cuenta que pasa cuando se reescribe una funcion a mano.
--
-- Ese script NO esta versionado —`scratch/` esta en `.gitignore`, igual que el
-- `build-0189-rescate.mjs` que cita la 0189—, asi que no lo busques en el
-- repositorio: lo que queda versionado es el resultado, que es esta migracion,
-- y el md5 de partida de aqui arriba, que es lo que permite reconstruirlo.
--
-- LO QUE NO CAMBIA: el delivery. La rama `ELSE` es la expresion anterior
-- intacta, asi que para `delivery_method = 'delivery'` el resultado es
-- identico bit a bit.
-- =============================================================================

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
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  -- Tiempo de cocción elegido por la cajera. Acotado igual que en advance_order.
  --
  -- EL ORDEN IMPORTA: se calcula DESPUÉS del SELECT porque ahora mira
  -- `v_order.prep_time_minutes`. Antes se calculaba arriba y solo veía el
  -- parámetro, que es lo que dejaba el minuto recién elegido sin efecto.
  --
  -- La prioridad es: lo que la cajera acaba de elegir > lo que se guardó al
  -- aceptar > 20. El fallback intermedio importa para las llamadas que NO
  -- mandan tiempo (el rechazo, la validación antifraude): sin él, cualquier
  -- paso por aquí sin `p_prep_time_minutes` reescribiría el plan de cocina a 20.
  v_prep := greatest(1, COALESCE(p_prep_time_minutes, v_order.prep_time_minutes, 20));
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

    UPDATE public.orders
      SET status = 'preparing',
          prep_time_minutes   = v_prep,
          estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
          -- 0225 - un recojo NO abre la ventana de la cola del motorizado.
          appears_in_queue_at = CASE
            WHEN v_order.delivery_method = 'pickup' THEN NULL
            ELSE now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
          END,
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
            --
            -- AQUÍ ESTABA EL DEFECTO: era
            --     COALESCE(v_order.prep_time_minutes, v_prep)
            -- o sea que el minuto guardado al aceptar (20 por defecto) GANABA al
            -- que la cajera acababa de elegir en el modal. Elegía 10 y la cocina
            -- se quedaba con 20. `v_prep` ya lleva la prioridad correcta.
            prep_time_minutes   = v_prep,
            estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
            -- 0225 - un recojo NO abre la ventana de la cola del motorizado.
            appears_in_queue_at = CASE
              WHEN v_order.delivery_method = 'pickup' THEN NULL
              ELSE now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
            END,
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
              -- 0225 - un recojo NO abre la ventana de la cola del motorizado.
              appears_in_queue_at = CASE
                WHEN v_order.delivery_method = 'pickup' THEN NULL
                ELSE now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
              END
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
$function$

