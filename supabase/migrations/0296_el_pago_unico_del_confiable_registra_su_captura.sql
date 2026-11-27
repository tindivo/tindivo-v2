-- =============================================================================
-- 0294 · El pago único del cliente de confianza registra su captura y el negocio confirma el ingreso
-- =============================================================================
--
-- QUÉ CAMBIA
-- Nacen cuatro RPC para el pedido con entrega que el cliente de confianza paga con
-- «Yape o Plin» (`payment_intent = 'pending_yape'`) después de que el negocio lo aceptó:
--
--   delivery_payment_proof_next_attempt(order, customer)         -> int      (solo lectura)
--   register_delivery_payment_proof(order, customer, path)       -> jsonb
--   confirm_delivery_payment(order, actor)                       -> jsonb
--   reject_delivery_payment_proof(order, actor, attempt, reason) -> jsonb
--
-- Reutilizan las columnas de `orders` que ya usa el prepago (`comprobante_prepago_url`,
-- `proof_attempt`, `payment_proof_status`, `payment_verified_at`, `payment_verified_by`):
-- ni tabla, ni intent, ni estado nuevos. Diseño aprobado por Jesús el 2026-11-23
-- (decisiones 1 a 5 en A; el trigger de devolución y el guard de `advance_order` van en otra
-- migración, PR 2).
--
-- LO QUE NO HACEN (a propósito)
--   · No cambian `orders.status`: el pedido avanza igual con o sin captura, y la captura no es
--     una puerta (CA-PAY-P3). Por eso no pasan por `validate_order` ni por `advance_order`.
--   · No escriben en `business_charges` ni en `businesses.balance_due`: confirmar un ingreso no
--     es un cargo (invariante 9). Un pedido `pending_yape` confirmado y luego cancelado sigue sin
--     generar devolución; ese hueco (`handle_prepaid_refund_on_cancel`, 0124, exige `prepaid`) lo
--     cierra el PR 2.
--   · No tocan `delivered` ni `cancelled`: sobre un pedido cerrado fallan con `order_closed`.
--   · Rechazar una captura NO cancela el pedido, NO pone strike y NO deshace un ingreso ya
--     confirmado (decisión 2): deja `payment_proof_status = 'rejected'` y el cliente puede enviar
--     un segundo intento o pagar en la puerta.
--   · No hay policies de Storage nuevas: las URL firmadas las emite la API (decisión 5).
--
-- REGLAS
--   · Dueño: el cliente del pedido (registrar) o el dueño del negocio del pedido (confirmar,
--     rechazar; hoy `businesses.user_id`, la misma regla de `advance_order`). Un ajeno recibe
--     `P0002` igual que un pedido inexistente: no se enumeran pedidos.
--   · «Aceptado»: `confirmed`, `preparing`, `waiting_driver`, `heading_to_restaurant`,
--     `waiting_at_restaurant`, `picked_up`. Terminales: `delivered`, `cancelled`.
--   · Dos intentos como máximo (los mismos que el prepago). Ruta `<cliente>/<pedido>/attempt-<n>-…`
--     y archivo existente en `payment-proofs`.
--   · Cada función bloquea la fila (`FOR UPDATE`) y escribe `order_event_log` y `domain_events` en
--     la MISMA transacción (invariante 4). Los eventos `OrderPaymentProofUploaded`,
--     `OrderPaymentConfirmed` y `OrderPaymentProofRejected` NO están en `push_event_types()`
--     (0272): quedan como auditoría hasta que el PR 3 decida su aviso.
--   · Idempotentes: repetir la misma llamada devuelve `replayed: true` sin segundo evento.
--
-- ERRORES (la API los distingue por `hint`)
--   P0002 · no existe, o no es de este cliente / de este negocio
--   P0001 / order_not_pending_yape      · no es un pedido con entrega de pago único
--   P0001 / order_closed                · ya está entregado o cancelado
--   P0001 / order_not_accepted          · el negocio todavía no lo acepta
--   P0001 / payment_already_confirmed   · el ingreso ya está confirmado
--   P0001 / proof_attempts_exhausted    · ya hizo 2 intentos
--   P0001 / invalid_proof_path          · la ruta no es de este pedido y de este intento
--   P0001 / proof_file_missing          · el archivo no existe en Storage
--   P0001 / no_proof_to_reject          · no hay captura que rechazar
--   P0001 / proof_attempt_mismatch      · se rechaza otro intento que el vigente
--   P0001 / invalid_reason_code         · motivo fuera de la lista
--
-- PERMISOS. Reciben al actor explícito (DB-4): solo `service_role`.
--
-- REVERSIBILIDAD (no hay datos que migrar):
--   DROP FUNCTION public.reject_delivery_payment_proof(uuid, uuid, int, text);
--   DROP FUNCTION public.confirm_delivery_payment(uuid, uuid);
--   DROP FUNCTION public.register_delivery_payment_proof(uuid, uuid, text);
--   DROP FUNCTION public.delivery_payment_proof_next_attempt(uuid, uuid);
-- =============================================================================

-- ── 1. El intento que gastaría la próxima captura (solo lectura) ─────────────
CREATE OR REPLACE FUNCTION public.delivery_payment_proof_next_attempt(
  p_order_id uuid,
  p_customer_user_id uuid
) RETURNS int
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.customer_user_id IS DISTINCT FROM p_customer_user_id THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.delivery_method IS DISTINCT FROM 'delivery'
     OR v_order.payment_intent IS DISTINCT FROM 'pending_yape' THEN
    RAISE EXCEPTION 'El pedido no es un pago único con entrega'
      USING ERRCODE = 'P0001', HINT = 'order_not_pending_yape';
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'
      USING ERRCODE = 'P0001', HINT = 'order_closed';
  END IF;

  IF v_order.status NOT IN ('confirmed', 'preparing', 'waiting_driver', 'heading_to_restaurant',
                            'waiting_at_restaurant', 'picked_up') THEN
    RAISE EXCEPTION 'El negocio todavía no acepta el pedido'
      USING ERRCODE = 'P0001', HINT = 'order_not_accepted';
  END IF;

  IF v_order.payment_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'El negocio ya confirmó el ingreso'
      USING ERRCODE = 'P0001', HINT = 'payment_already_confirmed';
  END IF;

  IF v_order.proof_attempt >= 2 THEN
    RAISE EXCEPTION 'Límite de intentos de captura excedido'
      USING ERRCODE = 'P0001', HINT = 'proof_attempts_exhausted';
  END IF;

  RETURN v_order.proof_attempt + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_payment_proof_next_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_payment_proof_next_attempt(uuid, uuid) TO service_role;

-- ── 2. El cliente registra la captura (NO cambia el estado del pedido) ───────
CREATE OR REPLACE FUNCTION public.register_delivery_payment_proof(
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
  IF NOT FOUND OR v_order.customer_user_id IS DISTINCT FROM p_customer_user_id THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Reconfirmar el mismo archivo es idempotente (la respuesta se perdió tras el commit):
  -- no gasta intento, no escribe evento y no escribe nada.
  IF v_order.payment_intent = 'pending_yape' AND v_order.delivery_method = 'delivery'
     AND p_path IS NOT NULL AND v_order.comprobante_prepago_url IS NOT DISTINCT FROM p_path THEN
    RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                              'attempt', v_order.proof_attempt,
                              'paymentProofStatus', v_order.payment_proof_status,
                              'replayed', true);
  END IF;

  -- La regla vive en UNA función (la misma que consulta la API antes de firmar la subida).
  -- La fila ya está bloqueada: lo que lee es lo vigente.
  v_attempt := public.delivery_payment_proof_next_attempt(p_order_id, p_customer_user_id);

  IF p_path IS NULL OR NOT starts_with(
       p_path, p_customer_user_id::text || '/' || p_order_id::text || '/attempt-' || v_attempt || '-') THEN
    RAISE EXCEPTION 'Ruta de captura inválida'
      USING ERRCODE = 'P0001', HINT = 'invalid_proof_path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'payment-proofs' AND o.name = p_path
  ) THEN
    RAISE EXCEPTION 'El archivo de la captura no existe'
      USING ERRCODE = 'P0001', HINT = 'proof_file_missing';
  END IF;

  -- Ni `status` ni `validation_context`: la captura no frena ni adelanta al pedido.
  UPDATE public.orders
     SET comprobante_prepago_url = p_path,
         payment_proof_status = 'pending',
         proof_attempt = v_attempt
   WHERE id = p_order_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.delivery_payment_proof_uploaded', 'cliente', p_customer_user_id,
          jsonb_build_object('proof_path', p_path, 'attempt', v_attempt));

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderPaymentProofUploaded',
          jsonb_build_object('action', 'payment_proof_uploaded', 'status', v_order.status,
                             'attempt', v_attempt, 'proof_path', p_path));

  RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                            'attempt', v_attempt, 'paymentProofStatus', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.register_delivery_payment_proof(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_delivery_payment_proof(uuid, uuid, text) TO service_role;

-- ── 3. El negocio confirma que el ingreso llegó (con o sin captura) ──────────
CREATE OR REPLACE FUNCTION public.confirm_delivery_payment(
  p_order_id uuid,
  p_actor_user_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_at timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.businesses b
     WHERE b.id = v_order.business_id AND b.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.delivery_method IS DISTINCT FROM 'delivery'
     OR v_order.payment_intent IS DISTINCT FROM 'pending_yape' THEN
    RAISE EXCEPTION 'El pedido no es un pago único con entrega'
      USING ERRCODE = 'P0001', HINT = 'order_not_pending_yape';
  END IF;

  -- Idempotente: la segunda llamada devuelve el mismo resultado, sin segundo evento. Va
  -- antes del chequeo de cierre para que reintentar tras entregar no falle.
  IF v_order.payment_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                              'paymentProofStatus', v_order.payment_proof_status,
                              'paymentVerifiedAt', v_order.payment_verified_at,
                              'replayed', true);
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'
      USING ERRCODE = 'P0001', HINT = 'order_closed';
  END IF;

  v_at := now();
  UPDATE public.orders
     SET payment_proof_status = 'verified',
         payment_verified_at = v_at,
         payment_verified_by = p_actor_user_id
   WHERE id = p_order_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.delivery_payment_confirmed', 'business', p_actor_user_id,
          jsonb_build_object('has_proof', v_order.comprobante_prepago_url IS NOT NULL,
                             'attempt', v_order.proof_attempt));

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderPaymentConfirmed',
          jsonb_build_object('action', 'payment_confirmed', 'status', v_order.status,
                             'hasProof', v_order.comprobante_prepago_url IS NOT NULL));

  RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                            'paymentProofStatus', 'verified', 'paymentVerifiedAt', v_at);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_delivery_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_delivery_payment(uuid, uuid) TO service_role;

-- ── 4. El negocio rechaza la captura (sin cancelar, sin strike) ──────────────
CREATE OR REPLACE FUNCTION public.reject_delivery_payment_proof(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_attempt int,
  p_reason_code text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.businesses b
     WHERE b.id = v_order.business_id AND b.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.delivery_method IS DISTINCT FROM 'delivery'
     OR v_order.payment_intent IS DISTINCT FROM 'pending_yape' THEN
    RAISE EXCEPTION 'El pedido no es un pago único con entrega'
      USING ERRCODE = 'P0001', HINT = 'order_not_pending_yape';
  END IF;

  IF p_reason_code IS NULL
     OR p_reason_code NOT IN ('invalid_proof', 'wrong_amount', 'unreadable', 'other') THEN
    RAISE EXCEPTION 'Motivo de rechazo no válido'
      USING ERRCODE = 'P0001', HINT = 'invalid_reason_code';
  END IF;

  -- Un ingreso confirmado no se deshace.
  IF v_order.payment_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'El negocio ya confirmó el ingreso'
      USING ERRCODE = 'P0001', HINT = 'payment_already_confirmed';
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'
      USING ERRCODE = 'P0001', HINT = 'order_closed';
  END IF;

  IF v_order.comprobante_prepago_url IS NULL OR v_order.proof_attempt < 1 THEN
    RAISE EXCEPTION 'No hay captura que rechazar'
      USING ERRCODE = 'P0001', HINT = 'no_proof_to_reject';
  END IF;

  -- Se rechaza la captura que el negocio estaba mirando, no otra que llegó mientras tanto.
  IF p_attempt IS DISTINCT FROM v_order.proof_attempt THEN
    RAISE EXCEPTION 'La captura vigente es otra'
      USING ERRCODE = 'P0001', HINT = 'proof_attempt_mismatch';
  END IF;

  IF v_order.payment_proof_status = 'rejected' THEN
    RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                              'paymentProofStatus', 'rejected',
                              'attempt', v_order.proof_attempt,
                              'attemptsLeft', GREATEST(2 - v_order.proof_attempt, 0),
                              'replayed', true);
  END IF;

  UPDATE public.orders
     SET payment_proof_status = 'rejected'
   WHERE id = p_order_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.delivery_payment_proof_rejected', 'business', p_actor_user_id,
          jsonb_build_object('attempt', v_order.proof_attempt, 'reason_code', p_reason_code));

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderPaymentProofRejected',
          jsonb_build_object('action', 'payment_proof_rejected', 'status', v_order.status,
                             'attempt', v_order.proof_attempt, 'reasonCode', p_reason_code,
                             'attemptsLeft', GREATEST(2 - v_order.proof_attempt, 0)));

  RETURN jsonb_build_object('id', p_order_id, 'status', v_order.status,
                            'paymentProofStatus', 'rejected',
                            'attempt', v_order.proof_attempt,
                            'attemptsLeft', GREATEST(2 - v_order.proof_attempt, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.reject_delivery_payment_proof(uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_delivery_payment_proof(uuid, uuid, int, text) TO service_role;
