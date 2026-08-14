-- =============================================================================
-- 0158 · El reloj de validación de comprobante inicia al momento de la subida
-- =============================================================================
--
-- QUÉ PROBLEMA CORRIGE
-- `orders_before_write` sellaba el timestamp de entrada a `validando` así:
--
--     WHEN 'validando' THEN new.validating_at := COALESCE(new.validating_at, now());
--
-- Cuando un pedido prepago inicia en `pending_acceptance` o pasa por `awaiting_payment`
-- (donde el cliente tiene 10 minutos para pagar), al momento de subir el comprobante
-- el estado transiciona a `validando`. Sin embargo, el COALESCE preservaba cualquier
-- timestamp previo (como created_at), haciendo que la ventana de 10 minutos de validación
-- para la cajera iniciara recortada (ej. con solo 4:36 o 0:46 restantes) y el cron
-- auto-cancel-prepay-timeout cancelara el pedido prematuramente mientras la cajera
-- lo estaba revisando.
--
-- SOLUCIÓN CANÓNICA
-- Al igual que `pending_acceptance` y `awaiting_payment` (ajustados en 0103 y 0096),
-- cada entrada al estado `validando` debe sellar `now()` fresco, otorgando al restaurante
-- su ventana completa de 10 minutos para revisar el comprobante y confirmar el pedido.
--
-- REVERSIBILIDAD: Rollback en supabase/rollbacks/0158_the_proof_validation_clock_starts_when_uploaded.rollback.sql

CREATE OR REPLACE FUNCTION public.orders_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF new.short_id IS NULL THEN
    new.short_id := public.generate_short_id();
  END IF;
  IF tg_op = 'INSERT' OR new.status IS DISTINCT FROM old.status THEN
    CASE new.status
      WHEN 'validando' THEN new.validating_at := now();
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
