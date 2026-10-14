-- =============================================================================
-- ROLLBACK de la 0263 · las alertas operativas dejan de frenarse en el receptor
-- =============================================================================
--
-- Quita la función y la tabla. Solo guarda la hora de la última alerta por
-- tipo: no hay datos que conservar. SIN ESTO, la rama `OpsAlert` de `send-push`
-- (si sigue desplegada) responde 503 y no envía alertas.

DROP FUNCTION IF EXISTS public.claim_ops_alert(text, interval);
DROP TABLE IF EXISTS public.ops_alert_throttle;
