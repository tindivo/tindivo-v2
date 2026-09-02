-- ============================================================================
-- ROLLBACK 0204 — El grant por defecto volvió a entrar por la ventana
-- ============================================================================
--
-- Devuelve el `EXECUTE` a PUBLIC en las tres funciones trigger y repone la
-- firma de compatibilidad de `create_appeal_report`.
--
-- OJO: revertir esto vuelve a dejar publicadas tres funciones que nadie llama
-- por RPC. Solo tiene sentido si algo dependía de esos grants de una forma que
-- no supimos ver, y en ese caso lo correcto es GRANT explícito al rol que lo
-- necesite, no volver a abrirlas a PUBLIC.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.generate_delivery_charges() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_business_balance() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_reject_if_business_blocked() TO PUBLIC;

CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_customer_user_id uuid,
  p_description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN public.create_appeal_report(p_order_id, p_description);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, uuid, text) TO authenticated;
