-- ROLLBACK de 0171 — el vecino conocido vuelve a ser un desconocido.
--
-- Devuelve el guard de contraentrega de `create_customer_order` a la forma de
-- 0057 (viva hasta 0162): solo cuenta un `delivered` de ESTA cuenta. Con esto
-- los 622 teléfonos con historial de entregas del piloto vuelven a pagar por
-- adelantado en su primer pedido desde la app.
--
-- REVERTIR EL FRONT TAMBIÉN, O NINGUNO. `use-checkout-state.ts` pregunta por
-- `current_customer_trusted_for_contraentrega()` desde 0171. Si se revierte solo
-- la DB, el checkout seguirá OFRECIENDO contraentrega al vecino conocido y la
-- RPC se la rechazará con "Pago adelantado requerido para primer pedido." — el
-- peor de los dos mundos, porque el error aparece al confirmar y no antes.
--
-- Las dos funciones de 0171 se dejan CAER al final. Nada más las usa una vez
-- restaurado el guard; si el front todavía llama al wrapper, verá un error de
-- función inexistente, que es justamente por lo que hay que revertir los dos.
--
-- OJO CON LO QUE SE PIERDE. 0171 era el único sitio donde la DB hacía enforce de
-- `customer_profiles.contraentrega_blocked`. Al revertir, ese flag vuelve a ser
-- decoración del frontend: un cliente con la contraentrega restringida puede
-- saltárselo llamando a la RPC directamente. Era así antes de 0171 y volverá a
-- serlo.

-- ─── El guard, tal cual estaba en 0162 ───────────────────────────────────────
-- El cuerpo es el de 0162 con el bloque del guard restaurado. No se reproduce
-- entero aquí para no duplicar 470 líneas: aplicar 0162 tal cual reinstala la
-- definición exacta previa a 0171.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0162_the_pin_decides_what_the_delivery_costs.sql
--
-- (0162 es idempotente y no contiene DDL destructiva: solo CREATE OR REPLACE de
-- `create_customer_order`. Reaplicarla es seguro.)

-- ─── Las funciones de 0171 ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.current_customer_trusted_for_contraentrega();
DROP FUNCTION IF EXISTS public.customer_trusted_for_contraentrega(uuid);
