-- 0065_prepaid_timers_cron_alignment.sql
-- Alineación de timers pg_cron y app_settings con la nueva máquina de estados de prepago

-- 1. Actualizar app_settings con las nuevas claves de timers (paymentMinutes=10, proofValidationMinutes=5)
UPDATE public.app_settings
SET value = jsonb_build_object(
  'acceptanceMinutes', coalesce((value ->> 'acceptanceMinutes')::int, 5),
  'paymentMinutes', coalesce((value ->> 'paymentMinutes')::int, 10),
  'proofValidationMinutes', coalesce((value ->> 'proofValidationMinutes')::int, 5),
  'prepayVerificationMinutes', coalesce((value ->> 'prepayVerificationMinutes')::int, 10),
  'validationMinutes', coalesce((value ->> 'validationMinutes')::int, 5),
  'prepExtensionMinutes', coalesce((value ->> 'prepExtensionMinutes')::int, 10),
  'maxPrepExtensions', coalesce((value ->> 'maxPrepExtensions')::int, 2),
  'noShowWaitMinutes', coalesce((value ->> 'noShowWaitMinutes')::int, 5),
  'cashAutoConfirmHours', coalesce((value ->> 'cashAutoConfirmHours')::int, 24)
)
WHERE key = 'timers';

-- 2. Actualizar pg_cron jobs para el nuevo flujo de prepago:
-- - Aceptación de disponibilidad para TODOS los pedidos (incluido prepaid): 5 min
-- - Expiración de pago en awaiting_payment: 10 min
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auto-cancel-pending-acceptance', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'pending_acceptance_timeout',
          cancel_note = 'Auto-cancelado: el negocio no aceptó disponibilidad en 5 minutos'
      WHERE status = 'pending_acceptance'
        AND pending_acceptance_at IS NOT NULL
        AND pending_acceptance_at < now() - interval '5 minutes';
    $cron$);

    PERFORM cron.schedule('auto-cancel-prepay-timeout', '* * * * *', $cron$
      UPDATE public.orders
      SET status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'prepay_timeout',
          cancel_note = 'Auto-cancelado: pago no realizado en 10 minutos'
      WHERE status = 'awaiting_payment'
        AND updated_at < now() - interval '10 minutes';
    $cron$);
  END IF;
END $$;
