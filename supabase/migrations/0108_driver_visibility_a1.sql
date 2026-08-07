-- =============================================================================
-- 0108 · El motorizado ve el pedido mientras se cocina
-- =============================================================================
--
-- QUÉ CAMBIA
-- `ord_driver_read` exigía `status = 'waiting_driver' AND appears_in_queue_at
-- <= now()`. Eso escondía toda la fase de cocción: un pedido en 'preparing'
-- era invisible para el motorizado aunque su ventana ya estuviera abierta.
--
-- POR QUÉ
-- La condición de tiempo es una adición propia de v2. La policy equivalente en
-- producción (delivery.tindivo.com) nunca la tuvo, en ninguna de sus dos
-- versiones committeadas:
--
--   20260420010200_rls_policies.sql:88-94
--     or (public.current_user_role() = 'driver' and status = 'waiting_driver')
--
--   20260503000000_auto_assignment_activation.sql:125-136
--     or (public.current_user_role() = 'driver'
--         and status = 'waiting_driver'
--         and driver_id is null)
--
-- En prod, `appears_in_queue_at` solo aparece en funciones y crons de
-- asignación, nunca en RLS. La separación visible/tomable se resuelve en la
-- aplicación. Este cambio acerca v2 a prod, no la aleja.
--
-- DISEÑO
--   VISIBLE  -> lo gobierna esta policy: status in ('preparing','waiting_driver')
--   TOMABLE  -> lo gobierna el filtro de la app y la guarda de advance_order:
--               'waiting_driver' siempre, o 'preparing' con la ventana abierta
--
-- Se AGREGA `driver_id is null` en la rama del pool, por paridad con la versión
-- de mayo de prod. Hoy es inofensivo porque tomar un pedido lo saca de
-- 'waiting_driver' de inmediato, pero con traspasos entre motorizados un pedido
-- podría quedar en 'waiting_driver' con driver_id puesto y sería visible para
-- todo el mundo. La primera rama (driver_id = current_driver_id) sigue dando
-- acceso al dueño del pedido.
--
-- EFECTO COLATERAL DESEADO
-- Un pedido en 'waiting_driver' con `appears_in_queue_at` en el futuro deja de
-- estar escondido. Ese era el caso del pedido listo e invisible: la cajera pone
-- 30 min, marca listo con 25 restantes, y el pedido se enfriaba sin que nadie
-- pudiera verlo.

drop policy if exists ord_driver_read on public.orders;

create policy ord_driver_read on public.orders for select to authenticated
  using (
    (select public.current_user_has_role('driver')) and (
      driver_id = (select public.current_driver_id())
      or (
        status in ('preparing', 'waiting_driver')
        and driver_id is null
        and business_id in (
          select business_id from public.driver_restaurants
          where driver_id = (select public.current_driver_id())
        )
      )
    )
  );

comment on policy ord_driver_read on public.orders is
  'Visibilidad del motorizado: sus propios pedidos, más el pool de los restaurantes '
  'que tiene asignados en estado preparing o waiting_driver y sin motorizado. '
  'La TOMABILIDAD (appears_in_queue_at) NO se resuelve aquí: vive en el filtro de '
  'la app y en la guarda de advance_order(take).';
