-- =============================================================================
-- 0096 · Timestamp de entrada a awaiting_payment y corrección de timer pg_cron
-- =============================================================================
-- El cron job auto-cancel-prepay-timeout evaluaba `updated_at < now() - interval '10 minutes'`.
-- Como `updated_at` conservaba el timestamp inicial de creación del pedido (ej. 5 minutos antes),
-- el pedido se auto-cancelaba a los ~4:36 minutos de haber entrado a awaiting_payment.
--
-- Esta migración agrega la columna awaiting_payment_at, actualiza el trigger DB
-- `orders_before_write` para registrar la hora exacta de entrada a awaiting_payment
-- (asumiendo `now()` fresco en cada entrada, incluyendo reintentos tras rechazo de voucher),
-- y actualiza el cron job para evaluar `awaiting_payment_at < now() - interval '10 minutes'`.

-- 1. Agregar columna awaiting_payment_at
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS awaiting_payment_at timestamp with time zone;

COMMENT ON COLUMN public.orders.awaiting_payment_at IS
  'Timestamp exacto en que el pedido ingresó al estado awaiting_payment (confirmación de disponibilidad por el restaurante o reintento de comprobante).';

-- 2. Backfill para pedidos existentes en awaiting_payment
UPDATE public.orders
  SET awaiting_payment_at = COALESCE(validating_at, updated_at, created_at)
  WHERE status = 'awaiting_payment' AND awaiting_payment_at IS NULL;

-- 3. Actualizar función del trigger DB orders_before_write()
CREATE OR REPLACE FUNCTION public.orders_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF new.short_id IS NULL THEN
    new.short_id := public.generate_short_id();
  END IF;
  IF tg_op = 'INSERT' OR new.status IS DISTINCT FROM old.status THEN
    CASE new.status
      WHEN 'validando' THEN new.validating_at := COALESCE(new.validating_at, now());
      WHEN 'pending_acceptance' THEN new.pending_acceptance_at := COALESCE(new.pending_acceptance_at, now());
      WHEN 'awaiting_payment' THEN new.awaiting_payment_at := now();
      WHEN 'confirmed' THEN new.confirmed_at := COALESCE(new.confirmed_at, now());
      WHEN 'preparing' THEN new.preparing_at := COALESCE(new.preparing_at, now());
      WHEN 'waiting_driver' THEN new.waiting_driver_at := COALESCE(new.waiting_driver_at, now());
      WHEN 'heading_to_restaurant' THEN new.heading_at := COALESCE(new.heading_at, now());
      WHEN 'waiting_at_restaurant' THEN new.waiting_at_restaurant_at := COALESCE(new.waiting_at_restaurant_at, now());
      WHEN 'picked_up' THEN new.picked_up_at := COALESCE(new.picked_up_at, now());
      WHEN 'delivered' THEN new.delivered_at := COALESCE(new.delivered_at, now());
      WHEN 'cancelled' THEN new.cancelled_at := COALESCE(new.cancelled_at, now());
      ELSE NULL;
    END CASE;
  END IF;
  RETURN new;
END;
$$;

-- 4. Actualizar cron job auto-cancel-prepay-timeout
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auto-cancel-prepay-timeout', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'prepay_timeout',
          cancel_note = 'Auto-cancelado: pago no realizado en 10 minutos'
      WHERE status = 'awaiting_payment'
        AND (
          (awaiting_payment_at IS NOT NULL AND awaiting_payment_at < now() - interval '10 minutes')
          OR (awaiting_payment_at IS NULL AND updated_at < now() - interval '10 minutes')
        );
    $cron$);
  END IF;
END $$;

-- 5. Actualizar get_tracking RPC para exponer awaitingPaymentAt al cliente
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
