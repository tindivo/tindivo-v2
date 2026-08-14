-- =============================================================================
-- ROLLBACK 0158 · Restaura orders_before_write al estado exacto de la 0103
-- =============================================================================

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
      WHEN 'pending_acceptance' THEN new.pending_acceptance_at := now();
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
