-- =============================================================================
-- 0094 · Calibración del umbral spike_orders_per_hour (antifraude)
-- =============================================================================
-- Contexto:
--   Break-even estimado: ~11 pedidos/día → promedio horario ~0.5 pedidos/h.
--   Con spikeMultiplier=2, el disparo ocurre a partir de 2× el promedio = 1 pedido/h,
--   pero el floor spikeMinimumOrdersPerHour=6 lo eleva a 6 por hora.
--
-- Problema:
--   6 pedidos en una sola hora es alcanzable en hora pico legítima y genera
--   falsos positivos masivos: todos los pedidos caen a 'validando' y el negocio
--   debe aprobar manualmente cada uno, rompiendo el flujo de la plataforma.
--
-- Decisión:
--   Subir spikeMinimumOrdersPerHour a 20 (umbral de "hora pico anormal" para
--   un negocio small). spikeMultiplier queda en 2 (sin cambio) para preservar
--   la reacción proporcional al histórico cuando el volumen escale.
--
--   Para ajustar en el futuro sin nueva migración, basta con:
--     UPDATE app_settings
--       SET value = jsonb_set(value, '{spikeMinimumOrdersPerHour}', '30')
--       WHERE key = 'validation';
-- =============================================================================

UPDATE public.app_settings
  SET value = jsonb_set(
                value,
                '{spikeMinimumOrdersPerHour}',
                '20'
              )
  WHERE key = 'validation'
    AND (value->>'spikeMinimumOrdersPerHour')::int = 6;

-- Verificar resultado
DO $$
DECLARE
  v_val int;
BEGIN
  SELECT (value->>'spikeMinimumOrdersPerHour')::int INTO v_val
    FROM public.app_settings WHERE key = 'validation';
  IF v_val IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'Calibración de spike no aplicada — valor actual: %', v_val;
  END IF;
  RAISE NOTICE 'OK: spikeMinimumOrdersPerHour = % (actualizado de 6 a 20)', v_val;
END;
$$;
