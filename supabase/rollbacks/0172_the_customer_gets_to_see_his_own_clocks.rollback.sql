-- ROLLBACK de 0172 — `get_tracking` vuelve al payload de la 0170 y
-- `acceptanceMinutes` vuelve a 15.
--
-- OJO CON LO QUE SE REVIERTE
-- El front cae a sus fallbacks (5 y 15 min) y a `createdAt` como base del
-- countdown de aceptación, así que no revienta: pinta relojes aproximados en vez
-- de exactos. Lo que vuelve de verdad es el desacuerdo del punto 2 —
-- `acceptanceMinutes` a 15 contra unos crons que cancelan a los 5—, y con el
-- countdown ya en pantalla ese desacuerdo pasa a ser visible para el cliente.
-- Si se revierte esta migración, revierte también los countdowns del front.

UPDATE public.app_settings
SET value = jsonb_set(value, '{acceptanceMinutes}', '15'::jsonb, true)
WHERE key = 'timers';

CREATE OR REPLACE FUNCTION public.get_tracking(p_short_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'paysWith', o.client_pays_with, 'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'arrivedAtCustomerAt', o.arrived_at_customer_at,
    'readyEarlyUsed', coalesce(o.ready_early_used, false), 'readyEarlyAt', o.ready_early_at,
    'travelMinutes', jsonb_build_object(
      'min', coalesce((t.value ->> 'travelMinutesMin')::int, 20),
      'max', coalesce((t.value ->> 'travelMinutesMax')::int, 25)
    ),
    'prepayVerificationMinutes', coalesce((t.value ->> 'prepayVerificationMinutes')::int, 10),
    'driverPhone', CASE WHEN o.arrived_at_customer_at IS NOT NULL THEN d.phone ELSE NULL END,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'awaitingPaymentAt', o.awaiting_payment_at,
    'validatingAt', o.validating_at,
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
  LEFT JOIN public.app_settings t ON t.key = 'timers'
  WHERE o.short_id = p_short_id
    AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '24 hours');
  RETURN v_result;
END;
$function$;
