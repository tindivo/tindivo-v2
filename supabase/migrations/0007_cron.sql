-- =============================================================================
-- 0007 · pg_cron — failsafe (Inngest hará los timers precisos en Fase 2)
-- Aislado del esquema: si pg_cron no estuviera disponible, no bloquea 0001-0006.
-- Los cambios de status que hacen estos crons quedan AUDITADOS automáticamente
-- por el trigger trg_orders_log_status (order_status_history). El push al cliente
-- lo maneja el camino preciso de Inngest en Fase 2 (estos son red de seguridad).
-- cron.schedule es idempotente por nombre de job.
-- =============================================================================

create extension if not exists pg_cron;

-- Auto-cancelar pedidos no aceptados por el negocio en 5 min
select cron.schedule('auto-cancel-pending-acceptance', '* * * * *', $cron$
  update public.orders
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'pending_acceptance_timeout',
      cancel_note = 'Auto-cancelado: el negocio no aceptó en 5 minutos'
  where status = 'pending_acceptance'
    and payment_intent <> 'prepaid'
    and pending_acceptance_at is not null
    and pending_acceptance_at < now() - interval '5 minutes';
$cron$);

-- Auto-cancelar prepago cuyo comprobante no se validó en 10 min
select cron.schedule('auto-cancel-prepay-timeout', '* * * * *', $cron$
  update public.orders
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'prepay_timeout',
      cancel_note = 'Auto-cancelado: comprobante de prepago no validado en 10 minutos'
  where status = 'pending_acceptance'
    and payment_intent = 'prepaid'
    and yape_confirmed = false
    and pending_acceptance_at is not null
    and pending_acceptance_at < now() - interval '10 minutes';
$cron$);

-- Auto-cancelar validaciones por llamada no resueltas en 5 min
select cron.schedule('auto-cancel-validando', '* * * * *', $cron$
  update public.orders
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'validation_timeout',
      cancel_note = 'Auto-cancelado: no se validó al cliente en 5 minutos'
  where status = 'validando'
    and validating_at is not null
    and validating_at < now() - interval '5 minutes';
$cron$);

-- Marcar liquidaciones semanales vencidas como overdue
select cron.schedule('mark-settlements-overdue', '0 7 * * *', $cron$
  update public.settlements
  set status = 'overdue'
  where status = 'pending' and due_date < current_date;
$cron$);

-- Auto-confirmar liquidación de efectivo a las 24h (inerte hasta que Fase 2
-- ponga registros en pending_confirmation; endurecido: exige delivered_amount)
select cron.schedule('auto-confirm-cash-settlements', '*/15 * * * *', $cron$
  update public.cash_settlements
  set status = 'auto_assumed_confirmed',
      confirmed_amount = coalesce(confirmed_amount, delivered_amount, 0),
      confirmed_at = now()
  where status = 'pending_confirmation'
    and delivered_amount is not null
    and delivered_at_ts is not null
    and delivered_at_ts < now() - interval '24 hours';
$cron$);

-- Prunes de retención
select cron.schedule('prune-stale-push-subscriptions', '0 4 * * *', $cron$
  delete from public.push_subscriptions
  where last_failed_at is not null
    and last_failed_at < now() - interval '14 days'
    and (last_successful_at is null or last_successful_at < now() - interval '14 days');
$cron$);

select cron.schedule('prune-idempotency-keys', '0 5 * * *', $cron$
  delete from public.idempotency_keys where expires_at < now();
$cron$);

select cron.schedule('prune-expired-rejections', '0 5 * * *', $cron$
  delete from public.order_assignment_rejections where expires_at < now();
$cron$);

select cron.schedule('prune-domain-events', '0 6 * * *', $cron$
  delete from public.domain_events where occurred_at < now() - interval '90 days' and published_at is not null;
$cron$);

select cron.schedule('prune-push-delivery-log', '0 6 * * *', $cron$
  delete from public.push_delivery_log where at < now() - interval '30 days';
$cron$);
