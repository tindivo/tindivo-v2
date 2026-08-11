-- Rollback de 0138_the_prunes_that_never_pruned.sql
--
-- Devuelve `prune-domain-events` a su predicado original —el que nunca borraba
-- nada— y retira la purga de `outbox_events`.
--
-- Revertir NO devuelve filas ya borradas. Mientras se revierta antes de finales
-- de octubre de 2026 da igual: hasta entonces ninguna de las dos purgas tiene
-- filas que cumplan su condición.

select cron.schedule('prune-domain-events', '0 6 * * *', $cron$
  delete from public.domain_events where occurred_at < now() - interval '90 days' and published_at is not null;
$cron$);

select cron.unschedule('prune-outbox-events')
 where exists (select 1 from cron.job where jobname = 'prune-outbox-events');
