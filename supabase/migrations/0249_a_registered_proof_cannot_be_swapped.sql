-- =============================================================================
-- 0249 · Un comprobante registrado no se cambia
-- =============================================================================
--
-- QUÉ CAMBIA
-- Un trigger BEFORE UPDATE en `orders` rechaza cambiar o borrar
-- `comprobante_prepago_url` cuando ya había uno, salvo que el mismo UPDATE suba
-- `proof_attempt` (un intento nuevo, tras un rechazo de la cajera). Pasar de NULL
-- a un valor siempre se permite.
--
-- POR QUÉ
-- `register_prepay_proof` (0248) ya solo escribe el comprobante desde
-- `awaiting_payment`. Esto es la segunda red: ningún otro camino (un UPDATE
-- directo, una ruta futura) puede sustituir en silencio la captura que la
-- cajera está mirando. Es lo que usará un reclamo o una apelación como prueba.
--
-- No toca dinero ni estados. REVERSIBILIDAD:
--   DROP TRIGGER trg_orders_proof_immutable ON public.orders;
--   DROP FUNCTION public.orders_proof_immutable();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_proof_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF old.comprobante_prepago_url IS NOT NULL
     AND new.comprobante_prepago_url IS DISTINCT FROM old.comprobante_prepago_url
     AND new.proof_attempt <= old.proof_attempt THEN
    RAISE EXCEPTION 'El comprobante registrado no se puede cambiar'
      USING ERRCODE = 'P0001', HINT = 'proof_immutable';
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_proof_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_proof_immutable ON public.orders;
CREATE TRIGGER trg_orders_proof_immutable
  BEFORE UPDATE OF comprobante_prepago_url ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_proof_immutable();
