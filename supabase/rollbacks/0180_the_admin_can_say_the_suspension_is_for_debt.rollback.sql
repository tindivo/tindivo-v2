-- ROLLBACK de 0180 — `block_business` vuelve a no poder marcar `blocked_for_debt`.
--
-- OJO: con esto la columna vuelve a ser huérfana. El mensaje «suspendida por
-- deuda acumulada» del panel del negocio deja de poder aparecer, y el desbloqueo
-- automático al pagar (`settle_business_charges`) vuelve a ser inalcanzable.
--
-- Si algún negocio quedó con la marca puesta, se la quitas:
--   update public.businesses set blocked_for_debt = false where blocked_for_debt;

DROP FUNCTION IF EXISTS public.block_business(uuid, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.block_business(p_id uuid, p_reason text, p_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.businesses
     SET is_blocked = true, block_reason = p_reason, updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no existe' USING errcode = 'P0002'; END IF;
  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('business', p_id, 'BusinessBlocked', jsonb_build_object('reason', p_reason, 'by', p_by));
  RETURN jsonb_build_object('blocked', true);
END;
$fn$;
