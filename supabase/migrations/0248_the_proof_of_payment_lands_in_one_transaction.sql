-- =============================================================================
-- 0248 · El comprobante de pago se registra en una sola transacción
-- =============================================================================
--
-- QUÉ CAMBIA
-- Nace `register_prepay_proof(p_order_id, p_customer_user_id, p_path)`. En UNA
-- transacción: bloquea el pedido, comprueba dueño, ruta, estado e intentos,
-- pasa el pedido a `validando` con el comprobante, deja el rastro en
-- `order_event_log` y escribe el evento en `domain_events` (outbox).
--
-- POR QUÉ (hallazgos H-1 y H-2 de Docs/planes/movil/contrato-rest.md §2)
--   · H-1 · La ruta leía el pedido y después hacía un UPDATE por `id` sin
--     repetir el estado: si el cron `cancel_expired_prepay_orders` lo cancelaba
--     entre medias, el comprobante lo devolvía a `validando`. Aquí el
--     `FOR UPDATE` serializa contra el cron y contra otro comprobante.
--   · H-2 · El evento del comprobante no pasaba por el outbox (invariante 4).
--     Ahora se escribe con el agregado, en la misma transacción.
--
-- EL EVENTO. `OrderPrepayProofUploaded` NO está en la lista de `dispatch_event`
-- (0238): queda en el outbox como auditoría y no dispara ningún push, igual que
-- hoy (el aviso a la cajera sigue yendo por Inngest desde la ruta, y solo si
-- esta función tuvo éxito). Meterlo en la lista es otra decisión.
--
-- ERRORES (todos `P0001`/`P0002`; la ruta los distingue por `hint`):
--   P0002                       · no existe, o no es de este cliente
--   P0001 / invalid_proof_path  · la ruta no cuelga de la carpeta del cliente
--   P0001 / order_not_awaiting_proof · no está en `awaiting_payment` prepago
--   P0001 / proof_attempts_exhausted · ya hizo 2 intentos
--
-- PERMISOS. Como `cancel_customer_order`, la llama la API con service role y le
-- pasa el id del usuario ya autenticado: por eso EXECUTE solo para
-- `service_role`. Si `authenticated` pudiera llamarla, podría suplantar a otro.
--
-- No toca dinero: solo el estado del pedido y el comprobante.
-- REVERSIBILIDAD: DROP FUNCTION public.register_prepay_proof(uuid, uuid, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_prepay_proof(
  p_order_id uuid,
  p_customer_user_id uuid,
  p_path text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_attempt int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  -- Dueño ajeno y pedido inexistente se responden igual: no se enumeran pedidos.
  IF NOT FOUND OR v_order.customer_user_id IS DISTINCT FROM p_customer_user_id THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_path IS NULL OR btrim(p_path) = ''
     OR left(p_path, length(p_customer_user_id::text) + 1) <> p_customer_user_id::text || '/' THEN
    RAISE EXCEPTION 'Ruta de comprobante inválida'
      USING ERRCODE = 'P0001', HINT = 'invalid_proof_path';
  END IF;

  IF v_order.status <> 'awaiting_payment' OR v_order.payment_intent <> 'prepaid' THEN
    RAISE EXCEPTION 'El pedido ya no espera comprobante'
      USING ERRCODE = 'P0001', HINT = 'order_not_awaiting_proof';
  END IF;

  IF v_order.proof_attempt >= 2 THEN
    RAISE EXCEPTION 'Límite de intentos de comprobante excedido'
      USING ERRCODE = 'P0001', HINT = 'proof_attempts_exhausted';
  END IF;

  v_attempt := v_order.proof_attempt + 1;

  UPDATE public.orders
     SET status = 'validando',
         validation_context = 'proof',
         comprobante_prepago_url = p_path,
         payment_proof_status = 'pending',
         proof_attempt = v_attempt,
         validating_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.prepay_proof_uploaded', 'cliente', p_customer_user_id,
          jsonb_build_object('proof_path', p_path, 'attempt', v_attempt));

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderPrepayProofUploaded',
          jsonb_build_object('action', 'prepay_proof_uploaded', 'status', 'validando',
                             'attempt', v_attempt, 'proof_path', p_path));

  RETURN jsonb_build_object('id', p_order_id, 'status', 'validando', 'attempt', v_attempt);
END;
$$;

REVOKE ALL ON FUNCTION public.register_prepay_proof(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_prepay_proof(uuid, uuid, text) TO service_role;
