-- =============================================================================
-- ROLLBACK de la 0228 · el checkout deja de ver venir el envío gratis
-- =============================================================================
--
-- Solo tira la función de lectura. No toca la 0227 (el cobro real sigue
-- funcionando) ni ninguna otra cosa. Tras esto, el checkout del cliente vuelve
-- a mostrar S/2.00 en la línea de envío para el plato de la promo, aunque el
-- servidor siga cobrando S/0 al confirmar.
-- =============================================================================

drop function if exists public.cart_item_free_delivery(uuid, uuid[]);
