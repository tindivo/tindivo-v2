-- =============================================================================
-- 0170 · El contador de validación del cliente deja de estar clavado a diez
-- =============================================================================
--
-- QUÉ CAMBIA
-- `get_tracking` publica `prepayVerificationMinutes` junto a los timers que ya
-- manda desde `0117`. Nada más: misma firma, mismo resto del payload.
--
-- POR QUÉ
-- `prepayVerificationMinutes` **es editable desde /admin/configuracion**
-- (apps/admin/lib/labels.ts: «Prepago (min)»), pero el cliente lo tenía escrito
-- a mano: `tracking-prepay.tsx` calculaba su cuenta atrás con
-- `startMs + 10 * 60 * 1000`.
--
-- O sea que si alguien subía ese valor desde el panel, la base empezaba a dar
-- más tiempo y el cliente seguía viendo diez minutos: su contador llegaba a
-- 00:00 y le hacía creer que había perdido el pedido mientras aún le quedaba
-- margen. El número no estaba mal hoy — estaba clavado, que es peor: no falla
-- hasta que alguien toca el panel, y entonces falla en el sitio equivocado.
--
-- Es el mismo patrón que `travelMinutes` en `0117` y por eso viaja igual: el
-- valor lo decide `app_settings`, lo publica esta función y el cliente solo lo
-- pinta. El `coalesce(..., 10)` conserva el comportamiento actual si la clave
-- faltara.
--
-- REVERSIBILIDAD: supabase/rollbacks/0170_...rollback.sql

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
