-- =============================================================================
-- 0072_fix_strike_report_trigger.sql
-- Corrige el trigger de creación de reportes para que solo se generen reportes
-- de revisión para strikes de tipo 'no_show'. Evita bucles redundantes cuando
-- un administrador ya ha resuelto un caso y se aplica un strike por intento de fraude.
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_report_for_strike()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Solo crear un reporte de revisión si el strike es de tipo 'no_show'
  -- (por ejemplo, reportado por un repartidor). Los strikes confirmados
  -- por el administrador (como 'fraud_attempt') no requieren una doble revisión.
  IF new.reason = 'no_show' THEN
    INSERT INTO public.reports (
      type, status, order_id, customer_user_id, customer_phone, created_by, description
    ) VALUES (
      'no_show', 'open', new.order_id, new.customer_user_id, new.phone, new.reported_by,
      'No-show: strike anclado a ' || COALESCE(new.delivery_reference, 'dirección sin referencia')
    );
  END IF;
  RETURN new;
END;
$$;
