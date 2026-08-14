-- =============================================================================
-- 0159 · El cron de validación de comprobante otorga 10 minutos (no 5)
-- =============================================================================
--
-- QUÉ PROBLEMA CORRIGE
-- El pg_cron `auto-cancel-validando` (creado en 0007_cron.sql para validaciones por
-- llamada telefónica antifraude) cancelaba a los 5 minutos cualquier pedido en
-- `validando`. Al introducirse el flujo de prepago con comprobante (cuya ventana
-- es de 10 minutos), este cron nunca se actualizó para excluir comprobantes,
-- cancelando a traición a los 5 minutos cualquier pedido prepago con comprobante
-- bajo el motivo `validation_timeout` ('Auto-cancelado: no se validó al cliente en 5 minutos').
--
-- SOLUCIÓN CANÓNICA
-- 1. `auto-cancel-validando` se restringe exclusivamente a validaciones por llamada
--    antifraude (`validation_context = 'call'` o pedidos contraentrega).
-- 2. Se programa `auto-cancel-prepay-validation-timeout` para cancelar pedidos prepago
--    con comprobante (`validation_context = 'proof'` o `payment_intent = 'prepaid'`)
--    únicamente cuando hayan transcurrido 10 minutos limpios (`interval '10 minutes'`),
--    con motivo `prepay_timeout`.
--
-- REVERSIBILIDAD: Rollback en supabase/rollbacks/0159_the_proof_validation_cron_gives_ten_minutes.rollback.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 1. Validaciones por llamada antifraude (5 min)
    PERFORM cron.schedule('auto-cancel-validando', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'validation_timeout',
          cancel_note = 'Auto-cancelado: no se validó al cliente en 5 minutos'
      WHERE status = 'validando'
        AND (validation_context = 'call' OR (validation_context IS NULL AND payment_intent <> 'prepaid'))
        AND validating_at IS NOT NULL
        AND validating_at < now() - interval '5 minutes';
    $cron$);

    -- 2. Validación de comprobante prepago (10 min)
    PERFORM cron.schedule('auto-cancel-prepay-validation-timeout', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'prepay_timeout',
          cancel_note = 'Auto-cancelado: validación no completada en 10 minutos'
      WHERE status = 'validando'
        AND (validation_context = 'proof' OR payment_intent = 'prepaid')
        AND validating_at IS NOT NULL
        AND validating_at < now() - interval '10 minutes';
    $cron$);
  END IF;
END $$;
