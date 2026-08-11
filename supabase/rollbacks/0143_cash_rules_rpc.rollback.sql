-- =============================================================================
-- ROLLBACK 0143 · Revierte max_cash_bill/max_change de app_settings
--                 y restaura create_customer_order al estado de 0105
-- =============================================================================
-- PASO 1: Eliminar los settings nuevos (solo si no hay dependencias activas).
-- PASO 2: Restaurar create_customer_order exactamente como estaba en 0105.
-- PASO 3: Restaurar RLS as_public_read sin las nuevas keys.
-- =============================================================================

-- 1. Eliminar settings de cash bill/change (idempotente con DO NOTHING)
DELETE FROM public.app_settings WHERE key IN ('max_cash_bill', 'max_change');

-- 2. Restaurar la RLS as_public_read sin max_cash_bill ni max_change
DROP POLICY IF EXISTS as_public_read ON public.app_settings;
CREATE POLICY as_public_read ON public.app_settings FOR SELECT TO anon, authenticated
  USING (key IN (
    'platform_schedule',
    'support_phone',
    'support_whatsapp',
    'prepay_threshold',
    'delivery_bands',
    'coverage',
    'coverage_polygon',
    'location_validation',
    'terms_version'
  ));

-- 3. Restaurar create_customer_order al estado de 0105
--    (sin guard pending_mixed, con greatest(0,...), sin R2/R3)
CREATE OR REPLACE FUNCTION public.create_customer_order(
  p_business_id uuid,
  p_customer_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_delivery_address text,
  p_delivery_reference text,
  p_delivery_lat numeric DEFAULT NULL::numeric,
  p_delivery_lng numeric DEFAULT NULL::numeric,
  p_source public.order_source DEFAULT 'customer_pwa'::public.order_source,
  p_client_pays_with numeric DEFAULT NULL::numeric,
  p_customer_gps_lat double precision DEFAULT NULL::double precision,
  p_customer_gps_lng double precision DEFAULT NULL::double precision,
  p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision,
  p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric,
  p_customer_gps_method text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
-- [Cuerpo completo de 0105 - ver supabase/migrations/0105_block_same_business_active_order.sql]
-- Este rollback restaura el estado anterior al 0143.
-- Reemplazar este bloque con el cuerpo completo de la función según 0105.
DECLARE BEGIN RAISE EXCEPTION 'ROLLBACK INCOMPLETO: Insertar aquí el cuerpo de 0105 antes de ejecutar'; END;
$function$;
