-- =============================================================================
-- 0189 · La cajera pone el tiempo de cocina de verdad
--
-- Idempotente. Rollback en
-- supabase/rollbacks/0189_the_cashier_sets_the_real_cooking_time.rollback.sql
-- =============================================================================
--
-- EL DEFECTO
-- Al aceptar un pedido prepago, el sistema guardaba `prep_time_minutes = 20`
-- como disponibilidad inicial. Cuando el cliente pagaba y subía el comprobante,
-- el pedido pasaba a `validando`; al confirmarlo, la cajera elegía el tiempo
-- real (10 minutos, pongamos) y `validate_order` hacía, en la rama 'proof':
--
--     prep_time_minutes = COALESCE(v_order.prep_time_minutes, v_prep)
--
-- Como `v_order.prep_time_minutes` YA valía 20, el COALESCE se quedaba con él y
-- los 10 minutos del modal se perdían. La cocina arrancaba con un plan que
-- nadie había elegido.
--
-- EL ARREGLO, EN TRES LÍNEAS
--   1. `v_prep` se calcula DESPUÉS del SELECT —antes se calculaba arriba, donde
--      `v_order` todavía no existe— y con la prioridad correcta:
--          elegido ahora > guardado al aceptar > 20
--   2. La rama 'proof' usa `v_prep` en vez del COALESCE invertido.
--   3. La rama `awaiting_payment` (0181) recalculaba `v_prep` con esa misma
--      expresión; ahora es un duplicado exacto del cálculo de arriba y se quita.
--
-- CÓMO SE GENERÓ ESTE CUERPO, Y POR QUÉ IMPORTA
-- El cuerpo NO está escrito a mano. Se extrae el de 0181 —verificado byte a
-- byte contra el `pg_get_functiondef` vivo en prod, md5
-- 90e4bbc4e0bdb4332cbd40136c83da2f— y se le aplican tres sustituciones
-- acotadas con `scratch/build-0189-rescate.mjs`, que aborta si un anclaje no
-- aparece exactamente una vez o si desaparece una línea que no toca.
--
-- Ese script existe por una razón concreta. Un primer borrador de esta misma
-- migración reescribió la función entera a mano. El arreglo que declaraba era
-- correcto, pero de camino se llevó por delante, sin decirlo:
--
--   · `cancel_reason = 'business_rejected'` — un valor que NO EXISTE en el enum
--     `cancel_reason`. Las dos ramas de rechazo reventaban con SQLSTATE 22P02.
--     La migración aplicaba en verde (PL/pgSQL no valida literales de enum al
--     crear la función) y fallaba la primera vez que la cajera rechazaba algo.
--   · `proof_rejected_final`, que la PWA del cliente consulta en cuatro sitios
--     para explicarle por qué se canceló su pedido prepago.
--   · Los eventos `order.validation_failed` y `order.validation_failed_retry`,
--     renombrados; los dos tienen etiqueta en la línea de tiempo del admin.
--   · La forma del jsonb de retorno (`ok` pasaba de true a false en el rechazo).
--   · Decenas de comentarios que explicaban el porqué de cada rama.
--
-- Aquel borrador nunca salió de una máquina local: no llegó a producción ni a
-- git. Esta migración lo sustituye entero. Se deja escrito aquí porque la
-- lección es reutilizable: para cambiar tres líneas de una función de 200, se
-- extrae y se parchea; no se reescribe.
--
-- LO QUE NO CAMBIA
--   La firma, el enum `cancel_reason`, los nombres de los eventos, la forma del
--   retorno y el resto del cuerpo: idénticos a 0181.
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
            --
            -- AQUÍ ESTABA EL DEFECTO: era
            --     COALESCE(v_order.prep_time_minutes, v_prep)
            -- o sea que el minuto guardado al aceptar (20 por defecto) GANABA al
            -- que la cajera acababa de elegir en el modal. Elegía 10 y la cocina
            -- se quedaba con 20. `v_prep` ya lleva la prioridad correcta.
            prep_time_minutes   = v_prep,
            estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
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
