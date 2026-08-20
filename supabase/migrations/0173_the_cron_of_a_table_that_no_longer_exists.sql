-- =============================================================================
-- 0173 · El cron de una tabla que ya no existe
-- =============================================================================
--
-- QUÉ CAMBIA
-- Se desprograma `mark-settlements-overdue`. Nada más.
--
-- POR QUÉ
-- La `0124` borró el módulo de liquidaciones —`DROP TABLE IF EXISTS
-- public.settlements`, línea 422— pero no tocó el pg_cron que lo barría cada
-- día a las 07:00. Desde entonces el job falla siempre, con el mismo error:
--
--   ERROR:  relation "public.settlements" does not exist
--
-- Medido en prod el 2026-08-20: 14 ejecuciones, 14 fallos, la primera el
-- 2026-08-06. Ni una sola correcta.
--
-- El daño funcional es CERO: `balance_due` se deriva del ledger desde la misma
-- 0124 y no hay nada que marcar como vencido. El daño real es de otro tipo —
-- `cron.job_run_details` tiene un rojo permanente, y un rojo que siempre está
-- encendido deja de ser una señal. El día que falle un cron que sí importa
-- (los cuatro que cancelan pedidos corren cada minuto) habrá que distinguirlo
-- de este ruido de fondo.
--
-- REVERSIBILIDAD: supabase/rollbacks/0173_the_cron_of_a_table_that_no_longer_exists.rollback.sql
-- El rollback NO reprograma el job: volver a programarlo solo devolvería el
-- fallo diario. Se documenta ahí por qué.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-settlements-overdue') THEN
      PERFORM cron.unschedule('mark-settlements-overdue');
    END IF;
  END IF;
END $$;
