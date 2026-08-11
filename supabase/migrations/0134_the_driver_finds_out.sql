-- 0134_the_driver_finds_out.sql
--
-- El motorizado se entera.
--
-- Hasta aquí `dispatch_event` reenviaba tres tipos de evento
-- (`OrderStatusChanged`, `OrderExpired`, `CashDelivered`) de los diecinueve que
-- emiten los RPC vivos. Los dieciséis restantes se caían en el `return new` del
-- filtro, en silencio. Entre ellos estaban los cinco del traspaso: con dos
-- motorizados en la calle, al dueño de un pedido le piden la entrega, tiene 30
-- segundos para responder, y no recibía ningún aviso; si dejaba pasar la
-- ventana la 0130 le cedía el pedido y tampoco se enteraba.
--
-- Tres cambios:
--
--   1. `dispatch_event` reenvía además los eventos que tienen destinatario
--      motorizado. La lista sigue siendo explícita —no un `not in` de auditoría—
--      porque lo que NO se notifica es una decisión de producto y se lee mejor
--      enumerada.
--
--   2. `respond_order_transfer` mete `fromDriverId`/`toDriverId` en el payload
--      de `TransferResolved` cuando la resolución es `rejected`. Las otras dos
--      resoluciones salen de `apply_order_transfer`, que sí los pone; la rama de
--      rechazo escribía solo `requestId` y `resolution`, así que send-push no
--      tenía a quién avisar. Se alinean también `transferred` y `reason` para
--      que las tres resoluciones tengan la misma forma.
--
--   3. `enqueue_overdue_orders` + cron: un pedido que lleva rato tomable y que
--      nadie ha tomado emite `OrderOverdue` una sola vez. Es el equivalente del
--      `OrderOverdue` del v1 y usa `assignment_rules.urgentAfterMinutes`, que ya
--      existía en `app_settings` junto con la columna `orders.urgent_since` —
--      ambas escritas por nadie hasta hoy.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · dispatch_event: la lista blanca se abre a los eventos del motorizado
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  -- Eventos con destinatario humano. El resto (`BusinessBlocked`,
  -- `CustomerNoShow`, `OrderValidated`, `OrderProofVerified`,
  -- `OrderPrepExtended`, `order/appeal.created`) es auditoría: se queda en el
  -- outbox y no viaja.
  if new.event_type not in (
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- aviso anticipado al motorizado si la cocina tarda
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfría (motorizados)
    'TransferRequested',    -- te piden tu pedido (dueño)
    'TransferResolved',     -- aceptado / rechazado / vencido (uno o los dos)
    'CashDelivered',        -- el motorizado declara efectivo (negocio)
    'CashConfirmed',        -- el negocio confirma (motorizado)
    'CashDisputed',         -- el negocio reporta diferencia (motorizado)
    'CashResolved'          -- Tindivo cierra el caso (motorizado)
  ) then
    return new;
  end if;

  select value into v_cfg from public.app_settings where key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  if v_url is null then
    return new; -- push no configurado (dev): no-op
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event_type', new.event_type,
      'aggregate_id', new.aggregate_id,
      'payload', new.payload
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
  return new;
end;
$$;

revoke all on function public.dispatch_event() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · respond_order_transfer: el rechazo dice a quién avisar
-- ═══════════════════════════════════════════════════════════════════════════
-- Idéntica a la versión viva salvo el `jsonb_build_object` de la rama de
-- rechazo, al final.

create or replace function public.respond_order_transfer(
  p_request_id uuid,
  p_responder_user_id uuid,
  p_accept boolean
)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_driver_id uuid;
  v_transferred boolean;
begin
  select id into v_driver_id from public.drivers where user_id = p_responder_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  -- Lock orders primero (orden consistente), luego la solicitud.
  select o.* into v_order
    from public.orders o
    join public.order_transfer_requests r on r.order_id = o.id
    where r.id = p_request_id
    for update of o;
  if not found then raise exception 'Solicitud no existe' using errcode = 'P0002'; end if;

  select * into v_req from public.order_transfer_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'La solicitud ya fue resuelta' using errcode = 'P0001';
  end if;
  if v_req.from_driver_id <> v_driver_id then
    raise exception 'No eres el motorizado de este pedido' using errcode = 'P0001';
  end if;

  -- El pedido cambió de manos o de estado mientras la solicitud vivía.
  if v_order.driver_id is distinct from v_req.from_driver_id
     or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = p_request_id;
    return jsonb_build_object('id', p_request_id, 'status', 'invalidated', 'transferred', false);
  end if;

  -- Expiración perezosa. Desde la 0130 vencer SÍ cede el pedido, salvo que el
  -- solicitante no tenga hueco. Da igual que la respuesta llegue tarde
  -- aceptando o rechazando: la ventana ya se cerró, y `transferred` dice lo que
  -- de verdad pasó en vez de una constante.
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    v_transferred := public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', v_transferred);
  end if;

  if p_accept then
    v_transferred := public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', v_transferred);
  end if;

  update public.order_transfer_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values (
    'order', v_req.order_id, 'TransferResolved',
    -- 0134: mismos campos que `apply_order_transfer`. Sin `toDriverId` el push
    -- del rechazo no tenía destinatario y el solicitante se quedaba mirando la
    -- pantalla sin saber que ya le habían dicho que no.
    jsonb_build_object(
      'requestId', p_request_id, 'resolution', 'rejected',
      'fromDriverId', v_req.from_driver_id, 'toDriverId', v_req.to_driver_id,
      'transferred', false, 'reason', null
    )
  );
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_req.order_id, 'order.transfer_rejected', 'driver', p_responder_user_id,
          jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'transferred', false);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · enqueue_overdue_orders: el pedido que nadie toma
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.enqueue_overdue_orders()
  returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_minutes int;
  v_count int := 0;
  v_order record;
begin
  select coalesce((value ->> 'urgentAfterMinutes')::int, 5)
    into v_minutes
    from public.app_settings
   where key = 'assignment_rules';
  v_minutes := coalesce(v_minutes, 5);

  -- Un pedido que ya tiene dueño deja de ser urgente. Se limpia aquí y no en
  -- `advance_order` para no reemitir una función de 400 líneas por un UPDATE:
  -- el efecto es el mismo con un minuto de retraso, y ese minuto no lo ve
  -- nadie porque `urgent_since` solo gobierna si este cron vuelve a avisar.
  update public.orders
     set urgent_since = null
   where urgent_since is not null
     and (driver_id is not null or status not in ('preparing', 'waiting_driver'));

  -- Tomable = las mismas dos condiciones que deja pasar `advance_order`
  -- ('take'): estado `waiting_driver` sin condición de tiempo, o `preparing`
  -- con la ventana de cola ya abierta. Si el pedido todavía no se puede tomar,
  -- que nadie lo haya tomado no es una anomalía.
  for v_order in
    select id, short_id, business_id
      from public.orders
     where driver_id is null
       and urgent_since is null
       and status in ('preparing', 'waiting_driver')
       and appears_in_queue_at is not null
       and appears_in_queue_at <= now() - make_interval(mins => v_minutes)
     for update skip locked
  loop
    -- `urgent_since` se sella ANTES del evento, en la misma transacción: es lo
    -- que hace que el aviso salga una sola vez aunque el cron corra cada minuto.
    update public.orders set urgent_since = now() where id = v_order.id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', v_order.id, 'OrderOverdue', jsonb_build_object(
      'shortId', v_order.short_id, 'businessId', v_order.business_id,
      'minutesWaiting', v_minutes
    ));

    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (v_order.id, 'order.overdue', 'system', null,
            jsonb_build_object('minutesWaiting', v_minutes));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_overdue_orders() from public, anon, authenticated;

comment on function public.enqueue_overdue_orders() is
  'Emite OrderOverdue (una vez, sellando urgent_since) para pedidos tomables que nadie tomo tras assignment_rules.urgentAfterMinutes.';

select cron.unschedule('flag-overdue-orders')
 where exists (select 1 from cron.job where jobname = 'flag-overdue-orders');

select cron.schedule(
  'flag-overdue-orders',
  '* * * * *',
  $cron$ select public.enqueue_overdue_orders(); $cron$
);
