-- =============================================================================
-- 0103 · Fix bug #1 — el timer de aceptación no se reiniciaba al reingresar
-- =============================================================================
--
-- QUÉ BUG CORRIGE
-- `orders_before_write` sellaba el timestamp de entrada a `pending_acceptance` así:
--
--     WHEN 'pending_acceptance' THEN new.pending_acceptance_at := COALESCE(new.pending_acceptance_at, now());
--
-- El COALESCE conserva el valor previo, de modo que cuando un pedido REINGRESA a
-- `pending_acceptance` el timestamp sigue siendo el de su creación. El reloj del
-- restaurante nunca se reinicia.
--
-- EL DAÑO CONCRETO
-- `validate_order` (introducido en 0095) devuelve un pedido PREPAGO de 'validando' a
-- 'pending_acceptance' cuando la cajera aprueba la validación antifraude. Entre medias
-- transcurre la llamada telefónica al cliente (hasta 5 minutos, que es el timeout del
-- estado 'validando'). Al volver, `pending_acceptance_at` sigue marcando T0 = creación,
-- así que el cron `auto-cancel-pending-acceptance` —que cancela a los 5 minutos contando
-- desde esa columna— lo mata en el siguiente tick. El restaurante nunca llega a verlo.
-- La ventana real del restaurante era `5 min − (duración de la validación)`, que puede
-- ser cero.
--
-- DECISIÓN DE NEGOCIO (opción A, tomada por el dueño del producto)
-- El restaurante debe recibir su ventana COMPLETA de aceptación contada desde que el
-- pedido le llega, no desde que el cliente lo creó. Por tanto el timestamp debe
-- refrescarse a now() en CADA entrada al estado.
--
-- ANÁLISIS: ¿es correcto refrescar en TODOS los caminos, o hace falta un condicional?
-- Se auditaron todas las funciones de `public` que mencionan 'pending_acceptance'.
-- Solo DOS caminos escriben ese estado; el resto son guardas o filtros de lectura
-- (advance_order, cancel_customer_order, expire_order, cancel_expired_prepay_orders,
-- admin_metrics). `create_business_manual_order` inserta directamente en 'confirmed'.
--
--   Camino 1 — INSERT inicial (create_customer_order).
--     tg_op = 'INSERT', y el INSERT no aporta `pending_acceptance_at` (queda NULL), así
--     que COALESCE ya resolvía a now(). Quitar el COALESCE da EXACTAMENTE el mismo
--     resultado. Sin cambio de comportamiento.
--
--   Camino 2 — reingreso desde 'validando' (validate_order, rama prepago + antifraude).
--     Aquí COALESCE conservaba T0. Con el cambio pasa a now(). Es justamente el fix, y
--     es lo que la opción A pide.
--
--   (Nota: create_customer_order también ejecuta un UPDATE posterior cuyo ELSE deja el
--   status en 'pending_acceptance'. Como el status NO cambia respecto al del INSERT, la
--   guarda `new.status IS DISTINCT FROM old.status` es falsa y el CASE ni se evalúa.)
--
-- Conclusión: los dos caminos deben sellar now(). No hace falta un fix condicional;
-- basta quitar el COALESCE. Queda además consistente con `awaiting_payment`, que ya se
-- refresca sin COALESCE desde 0096 por esta misma razón (reintentos de comprobante).
--
-- EFECTO COLATERAL ACEPTADO
-- Un INSERT que aportara `pending_acceptance_at` explícitamente ahora vería el valor
-- sobrescrito por now(). Ninguna ruta actual hace eso, y el comportamiento es coherente
-- con la opción A y con lo que `awaiting_payment` ya hacía.
--
-- ALCANCE: UNA SOLA LÍNEA
-- El cuerpo se copia literal del vivo (definido en 0096) y solo cambia la rama
-- 'pending_acceptance'. Las demás ramas del CASE —incluidas 'validando' y
-- 'awaiting_payment'— quedan idénticas, igual que la generación de short_id y la guarda
-- de la cabecera.
--
-- Se preservan: firma, RETURNS trigger, LANGUAGE plpgsql y `SET search_path = ''`
-- (invariante #3 de CLAUDE.md). La función NO es SECURITY DEFINER (prosecdef = false) y
-- así se mantiene. `CREATE OR REPLACE` conserva el ACL existente (postgres + service_role),
-- por lo que no se re-emite ningún GRANT, igual que hizo 0096.
--
-- No se edita 0096 ni ninguna otra migración aplicada (AGENTS.md §2.1).
-- El invariante afecta el ciclo de vida del pedido -> gate humano antes de prod (§2.2).

CREATE OR REPLACE FUNCTION public.orders_before_write() RETURNS trigger
  LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF new.short_id IS NULL THEN
    new.short_id := public.generate_short_id();
  END IF;
  IF tg_op = 'INSERT' OR new.status IS DISTINCT FROM old.status THEN
    CASE new.status
      WHEN 'validando' THEN new.validating_at := COALESCE(new.validating_at, now());
      -- FIX #1: antes era COALESCE(new.pending_acceptance_at, now()), que conservaba el
      -- timestamp de creación al reingresar desde 'validando' y hacía que el cron
      -- cancelara el pedido de inmediato. El restaurante recibe la ventana fresca.
      WHEN 'pending_acceptance' THEN new.pending_acceptance_at := now();
      WHEN 'awaiting_payment' THEN new.awaiting_payment_at := now();
      WHEN 'confirmed' THEN new.confirmed_at := COALESCE(new.confirmed_at, now());
      WHEN 'preparing' THEN new.preparing_at := COALESCE(new.preparing_at, now());
      WHEN 'waiting_driver' THEN new.waiting_driver_at := COALESCE(new.waiting_driver_at, now());
      WHEN 'heading_to_restaurant' THEN new.heading_at := COALESCE(new.heading_at, now());
      WHEN 'waiting_at_restaurant' THEN new.waiting_at_restaurant_at := COALESCE(new.waiting_at_restaurant_at, now());
      WHEN 'picked_up' THEN new.picked_up_at := COALESCE(new.picked_up_at, now());
      WHEN 'delivered' THEN new.delivered_at := COALESCE(new.delivered_at, now());
      WHEN 'cancelled' THEN new.cancelled_at := COALESCE(new.cancelled_at, now());
      ELSE NULL;
    END CASE;
  END IF;
  RETURN new;
END;
$$;
