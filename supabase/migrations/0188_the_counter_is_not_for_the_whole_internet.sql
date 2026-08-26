-- =============================================================================
-- 0188 · El contador de la promo no es para todo internet
--
-- Idempotente. Rollback en
-- supabase/rollbacks/0188_the_counter_is_not_for_the_whole_internet.rollback.sql
-- =============================================================================
--
-- EL DEFECTO, Y POR QUÉ NO SALTÓ ANTES
-- La 0187 cerró sus tres funciones así:
--
--     revoke all on function public.admin_promo_free_delivery_stats() from public;
--     grant execute on function public.admin_promo_free_delivery_stats() to service_role;
--
-- Y NO BASTA. `revoke ... from PUBLIC` quita el permiso implícito del
-- pseudo-rol PUBLIC, pero Supabase tiene DEFAULT PRIVILEGES que conceden
-- EXECUTE a `anon` y `authenticated` sobre toda función nueva del esquema
-- `public`. Esas son concesiones EXPLÍCITAS a roles con nombre, así que el
-- revoke sobre PUBLIC pasa por su lado sin tocarlas.
--
-- Medido en prod tras aplicar 0187:
--
--   admin_metrics (la referencia)   postgres | service_role | supabase_auth_admin
--   admin_promo_free_delivery_stats postgres | anon | authenticated | service_role
--                                              ^^^^   ^^^^^^^^^^^^^
--
-- CONSECUENCIA REAL
-- `admin_promo_free_delivery_stats` quedó colgando de
-- `/rest/v1/rpc/admin_promo_free_delivery_stats`, invocable por cualquiera con
-- la anon key —que es pública por diseño, va en el bundle del navegador—. No
-- expone datos personales, pero sí el consumo de la promo, su coste y el corte
-- nuevo/recurrente. Es información de negocio, y sobre todo NO es lo que la
-- 0187 decía hacer: su propio `revoke` declaraba la intención contraria.
--
-- POR QUÉ UNA MIGRACIÓN Y NO UN PARCHE A MANO
-- Porque el mismo olvido se repite en la siguiente función que alguien escriba.
-- Aquí queda escrito, en el historial, con el motivo.
--
-- QUÉ CAMBIA, FUNCIÓN POR FUNCIÓN
--   · admin_promo_free_delivery_stats  → SOLO service_role. La llama el route
--     de admin con el cliente de servicio; la autorización la hace el route.
--   · promo_settle_redemption          → fuera de `anon` y `authenticated`. Es
--     una función de TRIGGER; invocarla por RPC falla igual ("trigger functions
--     can only be called as triggers"), pero no tiene por qué estar publicada.
--     `service_role` CONSERVA el permiso a propósito: quitárselo a una función
--     que el motor ejecuta desde un trigger es arriesgar la entrega de pedidos
--     para ordenar un grant que ya no expone nada.
--   · current_customer_promo_free_delivery → authenticated + service_role, sin
--     `anon`. Responde por `auth.uid()`, así que para un anónimo devolvía
--     siempre `inactive` —inofensivo— pero no hay razón para ofrecerla.
--
-- LO QUE NO SE TOCA
--   · `promo_redemptions`. Su RLS está activa y sus dos policies son `to
--     authenticated`, así que `anon` no ve ni una fila. Verificado.
--   · El resto de funciones que el advisor marca igual (`effective_max_change`,
--     `delivery_band_for_point`, `current_service_date`…). Son anteriores, las
--     llama el navegador a propósito, y meterlas aquí sería colar un cambio de
--     superficie de ataque dentro de una corrección de la promo.
-- =============================================================================

-- El `from public` se mantiene además de los roles con nombre: quita el permiso
-- implícito, que es un tercer camino distinto de los otros dos.
revoke all on function public.admin_promo_free_delivery_stats() from public, anon, authenticated;
grant execute on function public.admin_promo_free_delivery_stats() to service_role;

revoke all on function public.promo_settle_redemption() from public, anon, authenticated;

revoke all on function public.current_customer_promo_free_delivery() from public, anon;
grant execute on function public.current_customer_promo_free_delivery() to authenticated, service_role;

comment on function public.admin_promo_free_delivery_stats is
  'Consumo de la promo de envío. SOLO service_role: la llama el route de admin, que es quien autoriza. Ver 0188.';
