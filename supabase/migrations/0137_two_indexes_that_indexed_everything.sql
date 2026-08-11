-- 0137_two_indexes_that_indexed_everything.sql
--
-- Dos índices parciales cuyo predicado nunca deja de cumplirse, así que en la
-- práctica indexan la tabla entera y crecen sin techo. Son el mismo error dos
-- veces: un índice parcial solo es barato si las filas SALEN de él.
--
--   1. `orders_queue_pending_idx` (la creé yo en la 0136, con el defecto dentro).
--      Filtra por `queue_notified_at is null`, y hay un camino normal por el que
--      un pedido nunca se sella: si la cajera marca "listo" ANTES de que llegue
--      su momento de cola —lo que la 0109 llama `ready_early`—, el pedido pasa a
--      `waiting_driver`, deja de cumplir el filtro de `enqueue_queued_orders`, y
--      se queda en el índice PARA SIEMPRE con una fecha ya vencida. Cada corrida
--      del cron, cada minuto, lo vuelve a mirar.
--      Se arregla metiendo `status` en el predicado: las filas salen solas en
--      cuanto el pedido avanza, y el índice se queda del tamaño de la cocina.
--
--   2. `de_unpublished_idx` (viene de la 0002). Filtra por `published_at is
--      null` sobre `domain_events` — y NADIE escribe nunca `published_at`. Se
--      declaró en la 0002, se lee en el cron de purga de la 0007, y no hay una
--      sola sentencia en todo el repo que lo ponga. O sea que el predicado se
--      cumple en el 100% de las filas desde el primer día: es un índice sobre la
--      tabla entera que no sirve a ninguna consulta, y solo cuesta escritura en
--      cada evento emitido. Se cae.
--
-- NO se toca aquí el otro lado de ese hallazgo: el cron `prune-domain-events`
-- borra `where published_at is not null`, así que tampoco borra nunca nada y
-- `domain_events` crece sin límite. Arreglarlo SÍ destruye datos (90 días de
-- historial de golpe en la primera corrida), y eso es una decisión de retención,
-- no un bug que se corrija de paso.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · El índice de la cola sale del índice cuando el pedido sale de cocina
-- ═══════════════════════════════════════════════════════════════════════════
-- Un predicado sobre columna mutable es legítimo: Postgres reevalúa la
-- pertenencia en cada UPDATE, que es justo el comportamiento que se busca.

drop index if exists public.orders_queue_pending_idx;

create index if not exists orders_queue_pending_idx
  on public.orders (appears_in_queue_at)
  where queue_notified_at is null and status = 'preparing';

comment on index public.orders_queue_pending_idx is
  'Sirve a enqueue_queued_orders. status va en el predicado a proposito: sin el, los pedidos marcados listos antes de su momento de cola se quedaban dentro para siempre.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · El índice de eventos sin publicar, que eran todos
-- ═══════════════════════════════════════════════════════════════════════════
-- Si algún día se construye el reintento del outbox (escribir `published_at`,
-- `retry_count`, `last_error`), este índice vuelve con una línea:
--   create index de_unpublished_idx on public.domain_events (occurred_at)
--     where published_at is null;
-- Mientras nadie escriba esa columna, mantenerlo es pagar escritura por nada.

drop index if exists public.de_unpublished_idx;
