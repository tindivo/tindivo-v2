-- 0196 · Cualquiera podía cerrar el restaurante
--
-- QUÉ CAMBIA
--   Se le quita a `anon` (y al PUBLIC implícito) el EXECUTE sobre dos RPC que
--   ESCRIBEN y que no comprueban quién las llama:
--
--     · public.block_business(uuid, text, uuid, boolean)
--     · public.request_order_validation(uuid, uuid)
--
--   Las dos pasan a ser solo de `service_role`, que es como ya las llama el API.
--
-- QUÉ ESTABA PASANDO
--   `block_business` es SECURITY DEFINER —o sea que se salta RLS—, pone
--   `businesses.is_blocked = true` y no valida al llamante por ningún lado: el
--   «quién» es un PARÁMETRO (`p_by`), que lo pone quien llama. Y `anon` tenía
--   EXECUTE, así que estaba publicada en `/rest/v1/rpc/block_business` para
--   cualquiera con la anon key — que es pública por diseño, va dentro del
--   bundle del navegador.
--
--   Resultado: cerrar un restaurante del piloto, con el motivo que se quisiera
--   y firmado a nombre de quien se quisiera, no requería sesión. El
--   `domain_events` que queda registra el `p_by` que dijera el atacante.
--
--   `request_order_validation` es el mismo patrón: SECURITY DEFINER, devuelve
--   `orders`, escribe, recibe el actor como parámetro (`p_business_user_id`) y
--   `anon` podía llamarla para cualquier `p_order_id`.
--
-- DE DÓNDE SALIÓ, PORQUE IMPORTA PARA NO REPETIRLO
--   De la 0180. Ahí `block_business` gano el parámetro `p_for_debt`, y eso se
--   hizo con un `DROP FUNCTION` de la firma vieja de 3 args + un CREATE de la
--   nueva de 4. Un CREATE FUNCTION nuevo nace con EXECUTE para PUBLIC. La 0180
--   añadió `GRANT ... TO authenticated, service_role` y se quedó ahí: nunca
--   revocó el PUBLIC por defecto, y `anon` lo hereda por ser miembro de PUBLIC.
--
--   Por eso `unblock_business` NO está expuesta y `block_business` sí: a la
--   otra no le cambió la firma, así que conservó los grants que ya tenía.
--
--   La leccion es la que la 0188 ya escribio y no se aplico aqui: un cambio de
--   firma no es un `CREATE OR REPLACE`, es una funcion nueva, y hay que
--   redeclarar sus permisos enteros.
--
-- POR QUÉ TAMBIÉN SE REVOCA A `authenticated`
--   Porque no lo necesita. El único camino real es el endpoint admin del API
--   (`/api/v1/admin/businesses/[id]/block`), que usa el cliente de servicio y
--   ya valida el rol antes de llamar. Un negocio o un motorizado autenticado no
--   tienen por qué poder bloquear a nadie, y `request_order_validation` la
--   invoca el API de negocios, también con service_role.
--
-- POR QUÉ `REVOKE ... FROM anon` A SECAS NO BASTA — ver 0188
--   Hay que quitar los dos: el grant explícito a `anon`/`authenticated` Y el
--   implícito de PUBLIC. Revocar solo uno deja el otro en pie y la función
--   sigue publicada.
--
-- LO QUE NO TOCA ESTA MIGRACIÓN
--   Las funciones de solo lectura que `anon` sí debe poder llamar —`get_tracking`,
--   `is_published_business`, `delivery_band_for_point`, `point_in_coverage_polygon`,
--   `current_service_date`, `get_order_intake_status`— se quedan como están: la
--   página de seguimiento y el checkout las necesitan sin sesión.
--
--   Tampoco toca `generate_delivery_charges`, `recalc_business_balance` ni
--   `orders_reject_if_business_blocked`: los advisors las marcan, pero devuelven
--   `trigger` y Postgres rechaza llamarlas directamente, así que no son
--   alcanzables por PostgREST.
--
-- IDEMPOTENTE: REVOKE y GRANT convergen; correrla dos veces deja lo mismo.

REVOKE ALL ON FUNCTION public.block_business(uuid, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_business(uuid, text, uuid, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.request_order_validation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_order_validation(uuid, uuid)
  TO service_role;
