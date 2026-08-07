-- =============================================================================
-- 0112 · Fuera la auto-confirmación de efectivo
-- =============================================================================
--
-- POR QUÉ
-- Una liquidación de efectivo se confirmaba SOLA a las 24 horas, por dos
-- caminos distintos y con resultados distintos:
--
--   · pg_cron 'auto-confirm-cash-settlements' (0007:57-66), cada 15 min,
--     rellenaba `confirmed_amount` con `delivered_amount`.
--   · Inngest `cashSettlementAutoConfirm` -> `auto_confirm_cash_settlement`
--     (0018:182-198), que NO tocaba `confirmed_amount` y lo dejaba en NULL.
--
-- Como Inngest dispara exacto a las 24h y el cron barre cada 15 minutos,
-- Inngest ganaba casi siempre: el campo quedaba NULL de forma sistemática.
--
-- Pero el motivo de fondo no es la carrera. Es que el antifraude de Tindivo es
-- HUMANO: la cajera cuenta el dinero. Dar por confirmado un fajo que nadie
-- contó, en silencio y con el importe que declaró el propio motorizado,
-- convierte una verificación en un trámite. Si la cajera no confirma, eso es
-- información — no un problema que el sistema deba tapar solo.
--
-- QUÉ QUEDA PENDIENTE (deliberado, no olvido)
-- Sin auto-confirmación, una liquidación puede quedarse en
-- `pending_confirmation` indefinidamente. Hace falta que alguien las vea. Hoy
-- solo aparecen en la pantalla de la cajera; no hay alerta ni tablero de
-- admin para ciclos viejos sin confirmar. Consulta de vigilancia:
--
--   select cs.id, b.name, d.full_name, cs.settlement_date, cs.delivered_amount,
--          now() - cs.delivered_at_ts as lleva_esperando
--   from public.cash_settlements cs
--   join public.businesses b on b.id = cs.business_id
--   join public.drivers d on d.id = cs.driver_id
--   where cs.status = 'pending_confirmation'
--     and cs.settlement_date < current_date
--   order by cs.settlement_date;
--
-- EL ENUM
-- `auto_assumed_confirmed` queda huérfano en `cash_settlement_status`. Los
-- valores de enum no se borran limpiamente en Postgres y no compensa: se deja
-- como valor histórico inalcanzable. Verificado antes de aplicar: cero filas
-- lo tienen.

-- 1. Cron fuera.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-confirm-cash-settlements') then
    perform cron.unschedule('auto-confirm-cash-settlements');
  end if;
end $$;

-- 2. La RPC deja de existir. La retirada del job de Inngest que la invocaba va
--    en el mismo commit (apps/api/lib/inngest/functions.ts).
drop function if exists public.auto_confirm_cash_settlement(uuid);

comment on type public.cash_settlement_status is
  'Estados de una liquidación de efectivo. `auto_assumed_confirmed` es histórico '
  'e inalcanzable desde 0112: la confirmación es siempre humana.';
