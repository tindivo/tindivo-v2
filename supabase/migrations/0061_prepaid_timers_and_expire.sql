-- 0061_prepaid_timers_and_expire.sql
-- Fase 2 Prepaid: Actualizar RPC get_tracking para exponer proofAttempt y proofUrl,
-- y actualizar expire_order para validar adecuadamente prepay_timeout en awaiting_payment.

-- 1. Actualizar get_tracking RPC
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
    'proofAttempt', o.proof_attempt,
    'proofUrl', o.comprobante_prepago_url,
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

-- 2. Actualizar expire_order RPC
CREATE OR REPLACE FUNCTION public.expire_order(
  p_order_id uuid,
  p_reason public.cancel_reason
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  IF p_reason = 'pending_acceptance_timeout' AND v_order.status <> 'pending_acceptance' THEN
    RETURN jsonb_build_object('expired', false, 'status', v_order.status);
  END IF;
  IF p_reason = 'prepay_timeout' AND v_order.status <> 'awaiting_payment' THEN
    RETURN jsonb_build_object('expired', false, 'status', v_order.status);
  END IF;
  IF p_reason = 'validation_timeout' AND v_order.status <> 'validando' THEN
    RETURN jsonb_build_object('expired', false, 'status', v_order.status);
  END IF;
  IF v_order.status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object('expired', false, 'status', v_order.status);
  END IF;

  UPDATE public.orders
    SET status = 'cancelled', cancel_reason = p_reason, cancelled_by = NULL
    WHERE id = p_order_id;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderExpired', jsonb_build_object('reason', p_reason));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.expired', 'system', NULL, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('expired', true, 'reason', p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_order(uuid, public.cancel_reason) TO service_role;
