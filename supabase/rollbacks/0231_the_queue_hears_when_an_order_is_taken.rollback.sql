-- =============================================================================
-- ROLLBACK de la 0231 · la cola deja de enterarse por Broadcast
-- =============================================================================
--
-- Quita el trigger, la función y la policy de `realtime.messages`. No toca
-- datos: el aviso no persiste nada útil (los mensajes de Broadcast caducan
-- solos).
--
-- SIN ESTO EL BOARD SIGUE FUNCIONANDO, solo que vuelve a enterarse tarde de un
-- pedido tomado por otro: por el poll de respaldo (15 s) en vez de al instante.
-- El cliente que escucha el tema `drivers:board` no falla si el tema calla.

DROP TRIGGER IF EXISTS trg_orders_broadcast_left_queue ON public.orders;
DROP FUNCTION IF EXISTS public.broadcast_order_left_queue();
DROP POLICY IF EXISTS drivers_receive_board_broadcast ON realtime.messages;
