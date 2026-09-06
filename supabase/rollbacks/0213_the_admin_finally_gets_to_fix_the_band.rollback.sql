-- =============================================================================
-- ROLLBACK de 0213 · El admin por fin puede corregir la banda
-- =============================================================================
--
-- NO restaura el CHECK de `delivery_fee_source` a ('business', 'system',
-- 'promo'). Si ya existe un pedido corregido por un admin, ese ALTER falla y
-- deja el rollback a medias. El CHECK ancho se queda: un valor permitido que
-- nadie vuelve a escribir no hace daño, y borrar el marcador de los pedidos ya
-- corregidos sería destruir la evidencia justo para poder revertir.
--
-- Tampoco se deshace ningún `business_charges` ni `orders` ya corregido: eso
-- es dato, no esquema, y un rollback de esquema no debe tocarlo.
-- =============================================================================

drop function if exists public.admin_correct_delivery_band(uuid, uuid, public.distance_band);
