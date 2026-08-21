-- =============================================================================
-- 0180 · El admin puede decir que la suspensión es por deuda
-- =============================================================================
--
-- QUÉ CAMBIA
-- `block_business` acepta un cuarto argumento, `p_for_debt` (por defecto false),
-- y con él marca `blocked_for_debt`. La firma vieja de 3 argumentos SE BORRA.
--
-- BORRARLA NO ES OPCIONAL, aunque el nuevo argumento tenga DEFAULT.
-- Dejar las dos convive mal con PostgREST: una llamada de 3 argumentos encaja en
-- ambas y devuelve
--
--   PGRST203 · Could not choose the best candidate function between:
--     public.block_business(p_id => uuid, p_reason => text, p_by => uuid),
--     public.block_business(p_id => uuid, p_reason => text, p_by => uuid,
--                           p_for_debt => boolean)
--
-- O sea que «mantener la firma vieja por compatibilidad» rompía justo lo que
-- pretendía proteger: el botón de suspender del panel de admin, que hoy llama
-- con tres. Lo cazo un test de integración antes de salir de local.
--
-- Se puede borrar sin red porque `block_business` tiene un único llamante en
-- todo el sistema — `POST /admin/businesses/:id/block`, actualizado en este
-- mismo commit — y ninguna función de la base la invoca.
--
-- POR QUÉ
-- `blocked_for_debt` era una columna huérfana: se APAGA sola —lo hacen
-- `settle_business_charges` y `unblock_business`— pero **ni una sola línea de
-- producción la encendía**. `block_business` solo tocaba `is_blocked`. La única
-- escritura a `true` en todo el repo estaba en un test, con un UPDATE directo.
--
-- Eso dejaba dos cosas colgando:
--
--   · El panel del negocio distingue desde hoy el mensaje de suspensión según
--     esa columna («por deuda acumulada» vs. genérico). Con nadie encendiéndola,
--     la rama de deuda era código inalcanzable: TODA suspensión caía en el texto
--     genérico, incluidas las que sí son por deuda.
--   · El desbloqueo automático al pagar (`settle_business_charges`, que exige
--     `blocked_for_debt = true AND balance_due <= 0`) tampoco podía dispararse
--     nunca. O sea que un negocio suspendido por deuda no volvía solo al pagar,
--     por mucho que la función estuviera escrita para eso.
--
-- Las dos se arreglan con lo mismo: que quien suspende pueda decir por qué.
--
-- LO QUE NO CAMBIA
-- El límite de crédito (`app_settings.debt_block_threshold`, S/600) sigue siendo
-- un AVISO: alcanzarlo no suspende a nadie. Ver `DECISIONS.md §9`. Esto no
-- reintroduce el corte automático de la 0178 — solo le da al admin la casilla
-- para etiquetar la suspensión que él decide.
--
-- REVERSIBILIDAD: supabase/rollbacks/0180_the_admin_can_say_the_suspension_is_for_debt.rollback.sql

DROP FUNCTION IF EXISTS public.block_business(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.block_business(
  p_id uuid,
  p_reason text,
  p_by uuid,
  p_for_debt boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.businesses
     SET is_blocked = true,
         blocked_for_debt = p_for_debt,
         block_reason = p_reason,
         updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negocio no existe' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('business', p_id, 'BusinessBlocked',
          jsonb_build_object('reason', p_reason, 'forDebt', p_for_debt, 'by', p_by));

  RETURN jsonb_build_object('blocked', true, 'forDebt', p_for_debt);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.block_business(uuid, text, uuid, boolean)
  TO authenticated, service_role;
