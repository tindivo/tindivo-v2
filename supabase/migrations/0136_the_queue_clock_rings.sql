-- 0136_the_queue_clock_rings.sql
--
-- El reloj de la cola suena, y el pedido nuevo despierta a la cajera.
--
-- Quedaban dos momentos sin aviso, y son justo los dos extremos del pedido:
--
--   1. EL RELOJ DE LA COLA. Un pedido entra a la bandeja del motorizado por dos
--      caminos: la cajera pulsa "listo" (`OrderStatusChanged/ready`, que SI
--      notifica) o se cumple `appears_in_queue_at`, que es
--      `now() + (prep - queue_lead_minutes)` desde la 0117. El segundo camino
--      no emitia ningun evento: el pedido aparecia en la bandeja en silencio.
--      Pasó en produccion con `3FUV9HVN`, que entró por reloj y lo tomaron sin
--      que sonara nada. Es el `OrderReadyForDrivers` del v1, que aqui nunca se
--      reconstruyó.
--
--      Un pedido con `prep <= queue_lead` es tomable desde que entra a cocina y
--      `headsUpNotes` lo descarta por umbral, asi que hasta hoy su UNICO aviso
--      era el de "listo". Ahora recibe el de cola en el siguiente minuto.
--
--   2. EL PEDIDO RECIEN CREADO. `OrderCreated` viajaba al push desde la 0134,
--      pero send-push solo lo usaba para el aviso anticipado al motorizado, que
--      exige `status = 'preparing'` — y el pedido del cliente nace en
--      `pending_acceptance` o en `validando`. Resultado: la cajera no recibia
--      nada por el pedido que tiene que aceptar o llamar antes de que el cron lo
--      cancele. Habia un aviso por Inngest (`order/notify-business`), un segundo
--      camino de push con su propia pareja VAPID y sus errores tragados, que
--      esta migracion deja obsoleto: el destinatario se resuelve en send-push,
--      igual que los otros doce avisos. Esa parte es solo codigo (send-push +
--      apps/api); aqui no hay nada que cambiar porque el evento ya viajaba.
--
-- El sello `queue_notified_at` va en la MISMA transaccion que el evento: es lo
-- que hace que el aviso salga una sola vez aunque el cron corra cada minuto.
-- Mismo patron que `urgent_since` en la 0134.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · El sello
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists queue_notified_at timestamptz;

comment on column public.orders.queue_notified_at is
  'Momento en que se aviso a los motorizados de que el pedido entro a la cola por reloj (appears_in_queue_at). Sella el aviso para que salga una sola vez.';

create index if not exists orders_queue_pending_idx
  on public.orders (appears_in_queue_at)
  where queue_notified_at is null;

-- Backfill: todo pedido que YA paso su momento de cola queda sellado. Sin esto,
-- la primera corrida del cron avisaria de golpe por cada pedido historico que
-- siguiera cumpliendo el filtro. Se sellan solo los que ya vencieron: un pedido
-- con `appears_in_queue_at` en el futuro tiene que conservar su aviso.
update public.orders
   set queue_notified_at = now()
 where queue_notified_at is null
   and appears_in_queue_at is not null
   and appears_in_queue_at <= now();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · enqueue_queued_orders: el pedido entra a la bandeja por reloj
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.enqueue_queued_orders()
  returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_count int := 0;
  v_minutes int;
  v_order record;
begin
  -- Solo `preparing`. Un pedido en `waiting_driver` llego a la bandeja porque la
  -- cajera pulso "listo", y ese camino ya emitio su propio aviso: anunciarlo
  -- otra vez seria el mismo pedido sonando dos veces por la misma razon.
  -- `driver_id is null` porque un pedido que ya tiene dueño no le interesa a
  -- nadie mas.
  for v_order in
    select id, short_id, business_id, estimated_ready_at
      from public.orders
     where queue_notified_at is null
       and driver_id is null
       and status = 'preparing'
       and appears_in_queue_at is not null
       and appears_in_queue_at <= now()
     for update skip locked
  loop
    -- Lo que de verdad le falta a la comida, no el `queueLeadMinutes` nominal:
    -- si la cajera extendio la preparacion (`extend_order_prep`), el nominal
    -- mentiria. Sin `estimated_ready_at` se manda 0 y el push omite el tiempo.
    v_minutes := greatest(
      0,
      ceil(extract(epoch from (coalesce(v_order.estimated_ready_at, now()) - now())) / 60)::int
    );

    update public.orders set queue_notified_at = now() where id = v_order.id;

    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', v_order.id, 'OrderQueued', jsonb_build_object(
      'shortId', v_order.short_id,
      'businessId', v_order.business_id,
      'minutesToReady', v_minutes
    ));

    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (v_order.id, 'order.queued', 'system', null,
            jsonb_build_object('minutesToReady', v_minutes));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_queued_orders() from public, anon, authenticated;

comment on function public.enqueue_queued_orders() is
  'Emite OrderQueued (una vez, sellando queue_notified_at) para pedidos en preparing cuyo appears_in_queue_at ya vencio y nadie ha tomado.';

select cron.unschedule('announce-queued-orders')
 where exists (select 1 from cron.job where jobname = 'announce-queued-orders');

select cron.schedule(
  'announce-queued-orders',
  '* * * * *',
  $cron$ select public.enqueue_queued_orders(); $cron$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · dispatch_event: la lista blanca admite OrderQueued
-- ═══════════════════════════════════════════════════════════════════════════
-- Identica a la 0134 salvo la linea de `OrderQueued`.

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
  -- `OrderPrepExtended`, `order/appeal.created`) es auditoria: se queda en el
  -- outbox y no viaja.
  if new.event_type not in (
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- pedido nuevo (negocio) + aviso anticipado (motorizado)
    'OrderQueued',          -- entro a la bandeja por reloj (motorizados)
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfria (motorizados)
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
