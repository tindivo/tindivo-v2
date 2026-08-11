-- =============================================================================
-- 0133 · Motorizados y negocios se vinculan solos
-- =============================================================================
--
-- EL FALLO QUE CIERRA, con nombre y apellido.
-- Ernesto Cruz se dio de alta desde el panel el 2026-08-09. El formulario hizo
-- todo lo que sabe hacer —cuenta de auth, fila en `drivers`, disponibilidad— y
-- nunca tocó `driver_restaurants`, porque no sabe que existe. Resultado: abrió
-- su app durante dos días y no vio UN SOLO pedido. Sin error, sin aviso, sin
-- pista. Se diagnosticó persiguiendo primero la llave VAPID y después el filtro
-- de disponibilidad — dos cosas que también estaban mal, pero que no eran esto.
--
-- La policy `ord_driver_read` filtra los pedidos sin dueño por
-- `business_id IN (SELECT business_id FROM driver_restaurants WHERE ...)`.
-- Sin fila ahí, el motorizado no ve nada. No es que no pueda TOMAR: no VE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UN TRIGGER Y NO UN CAMPO EN EL FORMULARIO
--
--   El panel ya tiene pantalla para asignar locales (se añadió junto con esta
--   migración) y con ella el problema se arregla en diez segundos... si alguien
--   se acuerda. El punto es que NADIE SE ACUERDA, y el castigo por olvidarlo es
--   invisible: no falla el alta, falla la app del motorizado horas después.
--
--   El v1 llegó exactamente a esta conclusión y la dejó escrita en
--   `20260507121000_driver_restaurants_auto_link.sql`:
--
--     "Si después se crea un driver o un restaurante nuevo, NO se popula
--      automáticamente la tabla pivote y findAssignmentCandidates() retorna []
--      — el pedido queda huérfano sin candidatos."
--
--   Y definió el criterio que se porta aquí: el default es TODOS VINCULADOS, y
--   la pantalla existe para las EXCEPCIONES (flotas dedicadas), no para el caso
--   normal. v2 tenía la regla invertida —default nadie, sin pantalla y sin
--   error— que es la peor de las tres combinaciones.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA RESPECTO AL v1
--
--   1. Nombres: `restaurants`/`restaurant_id` allá, `businesses`/`business_id`
--      acá. La tabla pivote conserva el nombre viejo (`driver_restaurants`) y
--      no se renombra en esta migración: sería un cambio ortogonal y ruidoso.
--
--   2. Se cubre también la REACTIVACIÓN. El v1 solo enganchaba en INSERT, así
--      que un negocio creado inactivo y activado después caía en el mismo hueco
--      —la misma clase de fallo, distinta puerta—. Acá los triggers también
--      disparan cuando `is_active` pasa de false a true.
--
--   3. `granted_by` queda NULL a propósito: distingue el vínculo AUTOMÁTICO del
--      que concedió una persona desde el panel. Sirve para auditar quién
--      decidió qué el día que haya flotas dedicadas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN **NO** DECIDE
--
--   Vincula a TODOS los negocios activos sin mirar `primary_capability`. Hoy es
--   correcto: en producción hay un solo tipo (`catalog_full`). Si mañana entran
--   negocios que no reparten a domicilio, este criterio hay que revisarlo —
--   está señalado aquí para que se encuentre cuando toque, no para resolverlo
--   ahora sin caso real.
--
--   Tampoco toca `is_blocked`. Bloquear un negocio es temporal y no debe borrar
--   los vínculos: al desbloquearlo, sus motorizados siguen siendo los suyos.
-- =============================================================================


-- ── 1 · Motorizado nuevo (o reactivado) → todos los negocios activos ─────────
CREATE OR REPLACE FUNCTION public.link_driver_to_all_businesses()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  -- El flanco se evalúa AQUÍ y no en un `WHEN` del trigger: en un trigger de
  -- INSERT la fila `OLD` no existe, así que una condición que la mencione
  -- revienta al crear el trigger. Dentro del cuerpo, `TG_OP` desambigua.
  IF tg_op = 'UPDATE' AND old.is_active THEN
    RETURN new;  -- ya estaba activo: no hay flanco de subida que atender
  END IF;

  INSERT INTO public.driver_restaurants (driver_id, business_id)
  SELECT new.id, b.id
    FROM public.businesses b
   WHERE b.is_active
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_link_businesses ON public.drivers;
CREATE TRIGGER trg_drivers_link_businesses
  AFTER INSERT OR UPDATE OF is_active ON public.drivers
  FOR EACH ROW
  -- Solo el flanco de subida importa: desactivar NO borra vínculos, que es lo
  -- que se quiere (al reactivar, sus locales siguen siendo los suyos).
  WHEN (new.is_active)
  EXECUTE FUNCTION public.link_driver_to_all_businesses();


-- ── 2 · Negocio nuevo (o reactivado) → todos los motorizados activos ─────────
CREATE OR REPLACE FUNCTION public.link_business_to_all_drivers()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  -- Mismo motivo que en el trigger de `drivers`: `OLD` no existe en INSERT.
  IF tg_op = 'UPDATE' AND old.is_active THEN
    RETURN new;
  END IF;

  INSERT INTO public.driver_restaurants (driver_id, business_id)
  SELECT d.id, new.id
    FROM public.drivers d
   WHERE d.is_active
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_businesses_link_drivers ON public.businesses;
CREATE TRIGGER trg_businesses_link_drivers
  AFTER INSERT OR UPDATE OF is_active ON public.businesses
  FOR EACH ROW
  WHEN (new.is_active)
  EXECUTE FUNCTION public.link_business_to_all_drivers();


-- ── 3 · Backfill ────────────────────────────────────────────────────────────
-- Arregla a quien YA está roto. Idempotente: `ON CONFLICT DO NOTHING`.
INSERT INTO public.driver_restaurants (driver_id, business_id)
SELECT d.id, b.id
  FROM public.drivers d
 CROSS JOIN public.businesses b
 WHERE d.is_active AND b.is_active
ON CONFLICT DO NOTHING;


-- ── 4 · Las funciones no son invocables por REST ─────────────────────────────
REVOKE ALL ON FUNCTION public.link_driver_to_all_businesses() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_business_to_all_drivers() FROM public, anon, authenticated;


-- ── 5 · Guard: ningún par activo puede quedar sin vincular ──────────────────
DO $$
DECLARE v_faltan int;
BEGIN
  SELECT count(*) INTO v_faltan
    FROM public.drivers d
   CROSS JOIN public.businesses b
   WHERE d.is_active AND b.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.driver_restaurants dr
        WHERE dr.driver_id = d.id AND dr.business_id = b.id
     );

  IF v_faltan > 0 THEN
    RAISE EXCEPTION '0133 abortada: quedan % pares activos sin vincular tras el backfill', v_faltan
      USING errcode = 'P0001';
  END IF;
END $$;
