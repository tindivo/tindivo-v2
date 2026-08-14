-- =============================================================================
-- ROLLBACK 0159 · Restaura los crons de pg_cron al estado anterior
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auto-cancel-validando', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'validation_timeout',
          cancel_note = 'Auto-cancelado: no se validó al cliente en 5 minutos'
      WHERE status = 'validando'
        AND validating_at IS NOT NULL
        AND validating_at < now() - interval '5 minutes';
    $cron$);

    PERFORM cron.unschedule('auto-cancel-prepay-validation-timeout');
  END IF;
END $$;
