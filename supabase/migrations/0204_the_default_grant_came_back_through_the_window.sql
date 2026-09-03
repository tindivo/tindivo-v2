-- ============================================================================
-- 0204 — El grant por defecto volvió a entrar por la ventana
-- ============================================================================
--
-- LO QUE DICEN LOS ADVISORS DE PROD (leídos el 2026-09-01).
--
-- Tres funciones TRIGGER tienen `EXECUTE` para PUBLIC. En `proacl` se ve como
-- la entrada sin destinatario, `=X/postgres`, y además arrastran grants
-- explícitos a `anon` y `authenticated`:
--
--   generate_delivery_charges()          -- camino del dinero
--   recalc_business_balance()            -- mantiene `businesses.balance_due`
--   orders_reject_if_business_blocked()  -- guarda de alta de pedidos
--
-- NO ES UN AGUJERO EXPLOTABLE, y conviene decirlo para que nadie lo trate como
-- una urgencia: devuelven `trigger`, así que PostgREST no las publica como RPC
-- y llamarlas directamente falla con «can only be called as a trigger
-- function». Lo que sí es, es una revocación que se perdió: `PENDIENTES` da
-- esto por cerrado en la `0123` («función de dinero ya no ejecutable por
-- anon») y hoy vuelve a estar abierto.
--
-- POR QUÉ VOLVIÓ. Un `CREATE OR REPLACE FUNCTION` no conserva la ACL cuando la
-- función se recrea desde cero, y los *default privileges* de Supabase dan
-- `EXECUTE` a PUBLIC en cuanto la ACL queda vacía. O sea: cada vez que una de
-- estas funciones se reescribe sin acordarse de revocar, el grant vuelve. Es
-- la misma trampa que ya mordió antes; por eso aquí se revoca de las tres
-- procedencias a la vez y no solo de PUBLIC.
--
-- REVOCAR ES SEGURO CON UN TRIGGER: Postgres comprueba el `EXECUTE` al CREAR el
-- trigger, no cada vez que dispara. Las tres siguen ejecutándose igual desde
-- sus tablas.
--
-- ── Y una firma de más ──────────────────────────────────────────────────────
--
-- `create_appeal_report` tiene dos versiones vivas. La de tres argumentos es un
-- envoltorio de compatibilidad que IGNORA `p_customer_user_id` y delega en la
-- de dos:
--
--   BEGIN RETURN public.create_appeal_report(p_order_id, p_description); END;
--
-- No hay suplantación —comprobado leyendo el cuerpo—, pero es una trampa
-- puesta: quien llame pasando el id de otro usuario recibe un no-op silencioso
-- en ese argumento y se queda pensando que hizo algo. El único llamador del
-- código (`apps/api/.../appeal/route.ts`) usa la de dos y lo dice en un
-- comentario, así que la de tres no la necesita nadie.
--
-- ROLLBACK: supabase/rollbacks/0204_the_default_grant_came_back_through_the_window.rollback.sql
-- ============================================================================

-- ── Las tres funciones trigger dejan de estar publicadas ────────────────────
REVOKE ALL ON FUNCTION public.generate_delivery_charges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_business_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_reject_if_business_blocked() FROM PUBLIC, anon, authenticated;

-- ── Fuera la firma de compatibilidad ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_appeal_report(uuid, uuid, text);
