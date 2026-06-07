-- 0035_fix_prepay_timeout_respect_proof_status.sql
-- Bugfix: el cron failsafe `auto-cancel-prepay-timeout` (0007) decidía "comprobante
-- no verificado" SOLO con el campo legacy `yape_confirmed = false`. El flujo nuevo de
-- verificación de comprobante (0031/0034 — botón "Correcto" del dashboard del negocio)
-- marca la verificación en `payment_proof_status = 'verified'` y NO toca `yape_confirmed`.
-- Resultado: un prepago legítimamente verificado por el negocio se auto-cancelaba 10 min
-- después de crearse (pérdida de un pedido ya pagado). Aquí el cron pasa a respetar el
-- nuevo flujo: solo cancela si NO está verificado por NINGUNO de los dos mecanismos.
-- cron.schedule es idempotente por nombre → re-programar reemplaza el job anterior.

select cron.schedule('auto-cancel-prepay-timeout', '* * * * *', $cron$
  update public.orders
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'prepay_timeout',
      cancel_note = 'Auto-cancelado: comprobante de prepago no validado en 10 minutos'
  where status = 'pending_acceptance'
    and payment_intent = 'prepaid'
    and yape_confirmed = false
    and payment_proof_status is distinct from 'verified'
    and pending_acceptance_at is not null
    and pending_acceptance_at < now() - interval '10 minutes';
$cron$);
