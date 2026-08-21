-- =============================================================================
-- 0172 · El cliente puede ver sus propios relojes
-- =============================================================================
--
-- QUÉ CAMBIA
--   1. `get_tracking` publica tres campos más: `pendingAcceptanceAt`,
--      `acceptanceMinutes` y `paymentMinutes`. Misma firma, mismo resto.
--   2. `app_settings.timers.acceptanceMinutes` baja de 15 a 5.
--
-- POR QUÉ (1)
--   El seguimiento del cliente enseña countdown en una sola de sus tres esperas
--   —la de `validando`, desde la 0170—. Las otras dos son mudas:
--
--     · pending_acceptance ·  5 min · el negocio confirma disponibilidad
--     · awaiting_payment   · 15 min · EL CLIENTE yapea y sube la captura
--     · validando          · 10 min · la cajera revisa esa captura  ← la única con reloj
--
--   La segunda es la que más duele. Es el único plazo que el cliente puede
--   perder por su propia mano, y hasta hoy no sabía que existía: si dejaba el
--   celular en el bolsillo, el pedido se le moría sin aviso previo. Para
--   pintarla hace falta `paymentMinutes` (el deadline se cuenta desde
--   `awaitingPaymentAt`, que ya viajaba desde la 0096).
--
--   La primera necesita además `pendingAcceptanceAt`, que no viajaba. `createdAt`
--   NO sirve de sustituto: `create_customer_order` deja el pedido en
--   `pending_acceptance` al final de su cuerpo, y para un pedido que pasó antes
--   por `validando` la diferencia entre las dos marcas son los minutos enteros
--   que la cajera tardó en validar. Contar desde `created_at` le habría restado
--   al cliente ese tiempo de su propia ventana.
--
--   Los minutos van por `app_settings` y no clavados en el front por la misma
--   razón que la 0170: un número escrito a mano en el cliente no falla hoy,
--   falla el día que alguien toca el panel, y falla enseñando un plazo que la
--   base ya no respeta.
--
-- POR QUÉ (2) — y esto es un desacuerdo real, no un ajuste de gusto
--   `acceptanceMinutes` decía 15 y la base cancela a los 5. Los tres sitios que
--   deciden de verdad están de acuerdo entre ellos y en contra de la config:
--
--     · pg_cron `auto-cancel-pending-acceptance` ....... interval '5 minutes'
--     · `cancel_expired_prepay_orders()` bloque 1 ...... interval '5 minutes'
--     · apps/negocios `ACCEPT_SEC` (view-model.ts:184) . 5 * 60
--     · DECISIONS.md §10 .............................. 5 min
--     · app_settings.timers.acceptanceMinutes ......... 15   ← el impostor
--
--   El 15 entró en la 0113 tocando SOLO la config, sin tocar los crons que
--   ejecutan la regla. El único que lo lee es el Inngest `order-acceptance-timeout`,
--   que por eso despierta diez minutos después de que el cron ya mató el pedido
--   —inofensivo, porque `expire_order` re-chequea el estado y no encuentra nada
--   que cancelar—. O sea: la ventana real siempre fue de 5 y el 15 nunca hizo
--   nada más que mentir.
--
--   Mientras el número no salía de la base, mentía en privado. Con este cambio
--   el cliente lo ve en pantalla, así que tiene que ser cierto ANTES de que se
--   publique: si no, su countdown marcaría 12:30 sobre un pedido que la base
--   canceló hace siete minutos.
--
-- REVERSIBILIDAD: supabase/rollbacks/0172_the_customer_gets_to_see_his_own_clocks.rollback.sql

-- 1. La config dice lo que la base hace.
UPDATE public.app_settings
SET value = jsonb_set(value, '{acceptanceMinutes}', '5'::jsonb, true)
WHERE key = 'timers';

-- 2. Los relojes viajan al cliente.
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
    'acceptanceMinutes', coalesce((t.value ->> 'acceptanceMinutes')::int, 5),
    'paymentMinutes', coalesce((t.value ->> 'paymentMinutes')::int, 15),
    'driverPhone', CASE WHEN o.arrived_at_customer_at IS NOT NULL THEN d.phone ELSE NULL END,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'pendingAcceptanceAt', o.pending_acceptance_at,
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
