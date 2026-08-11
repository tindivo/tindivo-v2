-- Rollback de 0137_two_indexes_that_indexed_everything.sql
--
-- Devuelve los dos índices a como estaban: el de la cola sin `status` en el
-- predicado (o sea, con el defecto de acumulación dentro), y el de
-- `domain_events` de vuelta.
--
-- Revertir no pierde datos: los índices se reconstruyen desde las tablas.

drop index if exists public.orders_queue_pending_idx;

create index if not exists orders_queue_pending_idx
  on public.orders (appears_in_queue_at)
  where queue_notified_at is null;

create index if not exists de_unpublished_idx
  on public.domain_events (occurred_at)
  where published_at is null;
