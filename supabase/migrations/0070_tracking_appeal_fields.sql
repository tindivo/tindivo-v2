-- =============================================================================
-- 0070_tracking_appeal_fields.sql
-- Parte 5: Añade campos de apelación a get_tracking RPC para la UI del cliente.
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tracking(p_short_id text)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', o.short_id,
    'orderNumber', o.order_number,
    'businessName', b.name,
    'businessAccentColor', b.accent_color,
    'status', o.status,
    'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent,
    'cancelReason', o.cancel_reason,
    'paysWith', o.client_pays_with,
    'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at,
    'deliveredAt', o.delivered_at,
    'driverName', d.full_name,
    'amount', o.order_amount,
    'deliveryFee', o.delivery_fee,
    'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'cancelledAt', o.cancelled_at,
    'proofAttempt', o.proof_attempt,
    'proofUrl', o.comprobante_prepago_url,
    'hasAppeal', EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.order_id = o.id
        AND r.type = 'rejected_proof_disputed'
    ),
    'appealStatus', (
      SELECT r.appeal_status FROM public.reports r
      WHERE r.order_id = o.id
        AND r.type = 'rejected_proof_disputed'
      LIMIT 1
    ),
    'refundStatus', (
      SELECT r.refund_status FROM public.reports r
      WHERE r.order_id = o.id
        AND r.type = 'rejected_proof_disputed'
      LIMIT 1
    ),
    'refundAmount', (
      SELECT r.refund_amount FROM public.reports r
      WHERE r.order_id = o.id
        AND r.type = 'rejected_proof_disputed'
      LIMIT 1
    ),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot,
          'qty', i.quantity,
          'lineTotal', i.line_total,
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
