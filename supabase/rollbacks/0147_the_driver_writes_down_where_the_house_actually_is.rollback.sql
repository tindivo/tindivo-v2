-- =============================================================================
-- ROLLBACK 0147 · Elimina el RPC de captura de dirección del motorizado
-- =============================================================================
--
-- La 0147 solo AÑADE una función. No creó tablas ni columnas, no tocó ninguna
-- función existente y no hizo backfill — así que revertirla es borrarla.
--
-- ⚠️ LO QUE YA SE ESCRIBIÓ SE QUEDA. Las coordenadas que el motorizado haya
--    capturado siguen en `address_directory` y en los pedidos. No se borran: son
--    direcciones reales verificadas por alguien que estuvo en la puerta, y es el
--    dato más valioso que produce el piloto. Lo único que se pierde es la
--    capacidad de capturar MÁS.
--
-- ⚠️ REVERTIR TAMBIÉN EL CLIENTE. `apps/motorizados` llama a este RPC vía
--    `/api/v1/driver/orders/[id]/address`. Sin la función, ese endpoint
--    devolverá error. La captura está construida para NO bloquear la entrega
--    (falla aparte del cobro), así que el motorizado puede seguir entregando —
--    pero verá un error al guardar la ubicación.
-- =============================================================================

DROP FUNCTION IF EXISTS public.capture_delivery_address(
  uuid, uuid, double precision, double precision, double precision, text
);
