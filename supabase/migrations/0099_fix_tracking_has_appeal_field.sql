-- Migration 0099: Exponer hasAppeal en get_tracking RPC y permitir apelación en prepay_timeout
-- 1. Actualizar get_tracking para incluir 'hasAppeal'
CREATE OR REPLACE FUNCTION public.get_tracking(p_short_id text)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'paysWith', o.client_pays_with, 'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'awaitingPaymentAt', o.awaiting_payment_at,
    'proofAttempt', o.proof_attempt,
    'proofUrl', o.comprobante_prepago_url,
    'hasAppeal', EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.order_id = o.id AND r.type = 'rejected_proof_disputed'
    ),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total,
          'modifiers', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'group', m.group_name_snapshot,
                'name', m.option_name_snapshot,
                'price', m.additional_price_snapshot
              )
              ORDER BY m.created_at
            )
            FROM public.customer_order_item_modifiers m WHERE m.item_id = i.id
          ), '[]'::jsonb)
        )
        ORDER BY i.created_at
      )
      FROM public.customer_order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.drivers d ON d.id = o.driver_id
  WHERE o.short_id = p_short_id
    AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '24 hours');
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;

-- 2. Permitir apelación también para prepay_timeout en create_appeal_report
CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_customer_user_id uuid;
  v_existing_id uuid;
  v_deadline timestamptz;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  IF v_order.customer_user_id <> v_customer_user_id THEN
    RAISE EXCEPTION 'No autorizado para apelar este pedido' USING errcode = 'P0001';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason NOT IN ('proof_rejected_final', 'prepay_timeout') THEN
    RAISE EXCEPTION 'Solo se puede apelar pedidos cancelados por rechazo de comprobante o tiempo expirado' USING errcode = 'P0001';
  END IF;

  IF v_order.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'El pedido no cuenta con fecha de cancelación registrada' USING errcode = 'P0001';
  END IF;

  v_deadline := v_order.cancelled_at + interval '24 hours';
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'La ventana de apelación de 24 horas ha expirado' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.reports
  WHERE order_id = p_order_id
    AND type = 'rejected_proof_disputed';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyExisted', true, 'reportId', v_existing_id);
  END IF;

  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by,
    appeal_status, appeal_deadline
  ) VALUES (
    'rejected_proof_disputed', 'open', p_order_id, v_order.business_id,
    v_customer_user_id, v_order.customer_phone,
    COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago'),
    v_order.comprobante_prepago_url,
    v_customer_user_id,
    'pending', v_deadline
  )
  RETURNING id INTO v_existing_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', v_customer_user_id,
    jsonb_build_object(
      'reportId', v_existing_id,
      'evidence_url', v_order.comprobante_prepago_url,
      'description', COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago')
    )
  );

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id::text, 'order/appeal.created', jsonb_build_object(
    'order_id', p_order_id,
    'report_id', v_existing_id,
    'business_id', v_order.business_id,
    'customer_user_id', v_customer_user_id,
    'appeal_deadline', v_deadline
  ));

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, text) TO authenticated;
