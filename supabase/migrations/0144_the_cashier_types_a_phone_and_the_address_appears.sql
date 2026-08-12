-- =============================================================================
-- 0144 · La cajera escribe un teléfono y sale la dirección
-- =============================================================================
--
-- POR QUÉ.
--   `address_directory` existe desde la 0122 con 658 filas migradas del legacy,
--   pero NADIE la lee: `grep address_directory apps/` no devuelve un solo
--   resultado. El activo operativo más valioso del piloto —lo que evita que la
--   cajera vuelva a teclear la dirección de un cliente frecuente con el teléfono
--   en la oreja— está en la base sin camino hasta la pantalla.
--
--   Este es ese camino. Definido en `spec_manual.md §1.5` (hallazgo 7) y
--   pendiente desde entonces (`PENDIENTES.md §3`: "definido, no implementado").
--
-- POR QUÉ UN RPC Y NO UN SELECT DIRECTO.
--   El legacy expone la tabla al navegador (`use-customer-addresses.ts`), lo que
--   además se salta la deduplicación que sí hacía su endpoint. Un RPC fija la
--   forma de la consulta en la DB: el cliente no elige qué columnas trae ni con
--   qué filtro. En particular NO devuelve `accuracy_m` — la cajera no la
--   necesita y `has_gps` basta para pintar el badge.
--
-- SECURITY INVOKER A PROPÓSITO, no DEFINER.
--   Así RLS sigue aplicando y no hay que replicar la lógica de permisos dentro
--   de la función. Las policies de la 0122 ya dicen quién puede leer el
--   directorio (admin, business, driver); esta función hereda esa decisión en
--   vez de tomarla otra vez.
--
-- TELÉFONO EXACTO, NO PREFIJO.
--   El predicado exige `^9\d{8}$` completo. Con 9 dígitos el espacio de
--   enumeración es 10^8: no es practicable barrerlo. Un LIKE por prefijo sí lo
--   sería, y convertiría el directorio en un padrón consultable. Por eso el
--   rate limiting queda como mejora opcional post-launch (spec §1.5, hallazgo
--   10) — lo que cierra la superficie es esta firma, no un contador.
--
-- QUÉ NO HACE.
--   No escribe. No incrementa `times_used` ni toca `last_used_at`: eso ocurre
--   cuando el pedido se crea, no cuando la cajera consulta. Contar consultas
--   como usos inflaría el "22 pedidos" que el modal muestra para desempatar
--   entre dos direcciones del mismo cliente, que es justo el número del que la
--   cajera se fía para elegir bien.
--
-- ROLLBACK: supabase/rollbacks/0144_the_cashier_types_a_phone_and_the_address_appears.rollback.sql
-- =============================================================================

-- ─── A · El RPC de lectura ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_address_directory(p_phone text)
RETURNS TABLE (
  id            uuid,
  phone         text,
  customer_name text,
  reference     text,
  lat           double precision,
  lng           double precision,
  has_gps       boolean,
  is_default    boolean,
  times_used    integer,
  last_used_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    ad.id, ad.phone, ad.customer_name, ad.reference,
    ad.lat, ad.lng,
    (ad.lat IS NOT NULL) AS has_gps,
    ad.is_default, ad.times_used, ad.last_used_at
  FROM public.address_directory ad
  WHERE ad.phone = p_phone
    AND p_phone ~ '^9\d{8}$'
  -- El orden lo fija la DB, no el cliente: es el que espera el modal de
  -- múltiples direcciones (spec_ui_cajera.md B3). La principal primero, luego
  -- por uso más reciente.
  ORDER BY ad.is_default DESC, ad.last_used_at DESC NULLS LAST
  -- 10 con holgura: el máximo medido es 4 direcciones para un mismo teléfono.
  LIMIT 10;
$$;

COMMENT ON FUNCTION public.search_address_directory(text) IS
  'Autocompletado del formulario manual. Exige teléfono exacto de 9 dígitos. '
  'SECURITY INVOKER: la RLS de address_directory decide quién ve qué.';

-- ─── B · Grant ───────────────────────────────────────────────────────────────
-- OBLIGATORIO Y FÁCIL DE OLVIDAR. `0009_function_grants.sql` revoca EXECUTE a
-- anon y authenticated, y `0100_declare_grants.sql` fija los default privileges.
-- Sin esta línea la función existe pero el navegador de la cajera recibe
-- "permission denied for function", que se lee como un bug del formulario.
--
-- `anon` NO: sin sesión no hay rol que evaluar, y la RLS de la 0122 exige uno de
-- los tres roles operativos. Un anon solo obtendría cero filas — pero mejor que
-- ni pueda llamar.
--
-- EL REVOKE VA A `public`, NO A `anon`. Postgres otorga EXECUTE a PUBLIC en toda
-- función nueva, y `anon` hereda de ahí: revocarle a `anon` directamente deja el
-- grant de PUBLIC intacto y la función sigue siendo ejecutable por cualquiera.
-- Medido en local: con `REVOKE ... FROM anon`,
-- `has_function_privilege('anon', ..., 'execute')` seguía dando `true` y el ACL
-- conservaba la entrada `=X/postgres`. Es el mismo orden que usa
-- `0008_hardening.sql`: primero se le quita a PUBLIC, después se otorga a quien
-- corresponde. Por eso el REVOKE va ANTES que los GRANT.
REVOKE EXECUTE ON FUNCTION public.search_address_directory(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.search_address_directory(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_address_directory(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_address_directory(text) TO service_role;
