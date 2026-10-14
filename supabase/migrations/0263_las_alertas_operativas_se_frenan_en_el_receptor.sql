-- ============================================================================
-- 0263 — Las alertas operativas se frenan también en el receptor (send-push)
-- ============================================================================
--
-- `apps/api/lib/ops/alert-ops.ts` deduplica 30 min por tipo, pero en la memoria
-- de cada instancia serverless. La Edge Function `send-push` (rama `OpsAlert`)
-- no debe fiarse de quien la llama: reserva su turno aquí, de forma atómica,
-- una vez por `kind` y ventana. Solo el service_role (la propia Edge Function)
-- puede llamarla; sin datos personales: guarda el tipo y la hora.
--
-- Despliegue: aditivo (tabla y función nuevas). `db push` antes de desplegar
-- `send-push`; sin esta función, la rama `OpsAlert` responde 503 y no envía.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ops_alert_throttle (
  kind         text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ops_alert_throttle IS
  'Última alerta operativa por tipo. Solo la lee y escribe claim_ops_alert (service_role).';

ALTER TABLE public.ops_alert_throttle ENABLE ROW LEVEL SECURITY;
-- Sin policies: ningún rol de cliente lee ni escribe; service_role se salta RLS.
REVOKE ALL ON TABLE public.ops_alert_throttle FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_ops_alert(
  p_kind   text,
  p_window interval DEFAULT interval '30 minutes'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  -- Atómico: el ON CONFLICT bloquea la fila, así que de N llamadas simultáneas
  -- solo una ve la ventana vencida y actualiza; el resto devuelve false.
  INSERT INTO public.ops_alert_throttle AS t (kind, last_sent_at)
  VALUES (p_kind, now())
  ON CONFLICT (kind) DO UPDATE
    SET last_sent_at = now()
    WHERE t.last_sent_at <= now() - p_window
  RETURNING t.kind INTO v_kind;

  RETURN v_kind IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ops_alert(text, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ops_alert(text, interval) TO service_role;
