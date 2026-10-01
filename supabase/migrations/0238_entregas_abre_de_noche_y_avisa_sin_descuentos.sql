-- ════════════════════════════════════════════════════════════════════════════
-- 0238 · Entregas abre de 6 a 11 pm, avisa por push, y se acaban los descuentos
--
-- Tres decisiones de Jesús (2026-10-01), una migración:
--
-- 1 · TINDIVO ENTREGAS SE ENCIENDE, de 18:00 a 23:00, de lunes a domingo.
--     El horario ya era «todos los días» por omisión (0232), pero eso estaba
--     implícito en el cuerpo de `is_within_courier_schedule`. Ahora los días
--     viven en `app_settings.courier.hours.days` (ISO: 1 = lunes … 7 =
--     domingo), así que cerrar un día es un UPDATE y no una migración. Sin la
--     clave, la función sigue abriendo todos los días: una config vieja no
--     cambia de comportamiento.
--
-- 2 · ENTREGAS ENTRA AL OUTBOX. Hasta hoy los pasos de una entrega solo
--     quedaban en `courier_order_events` (auditoría) y nadie se enteraba con
--     el celular bloqueado: el motorizado dependía del sondeo de 15 s con la
--     app abierta, y el cliente de tener el seguimiento en pantalla. Un
--     trigger copia los pasos que tienen destinatario humano a
--     `domain_events`, EN LA MISMA TRANSACCIÓN (invariante 4), y
--     `dispatch_event` los manda a `send-push` como `CourierStepped`. Es el
--     mismo camino que la comida, no uno paralelo.
--
--     Un trigger y no un INSERT en cada función porque los pasos ya se
--     escriben en un solo sitio por función (`courier_order_events`), y
--     repetir la escritura del outbox en las cinco funciones que avanzan una
--     entrega es justo la clase de copia que envejece por separado.
--
-- 3 · SE APAGAN TODOS LOS DESCUENTOS. La promo de envío gratis del lanzamiento
--     (0187/0209) y el envío gratis por plato de Al Punto (0227 martes y
--     jueves, 0230 hasta el 27-09). Se apagan los DATOS, no el mecanismo: las
--     funciones son fail-closed (`active = false`, columnas en NULL → nunca
--     aplica), así que el checkout deja de pintar «envío gratis» sin tocar
--     TypeScript, y el día que haga falta otra promo es un UPDATE.
--
-- De paso se arregla `expire_courier_orders`: registraba el evento
-- `courier.expired` de TODO lo cancelado por `no_driver` en el último minuto,
-- no solo de lo que esa llamada acababa de vencer. Con Inngest y el cron
-- corriendo a la vez, la misma entrega podía quedar vencida dos veces en el
-- log — inofensivo mientras era solo auditoría, un push duplicado al cliente
-- ahora que el log alimenta el outbox.
--
-- Idempotente: fusiones de jsonb, `create or replace`, `drop trigger if exists`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Entregas: encendido, 18–23 h, lunes a domingo ───────────────────────

update public.app_settings
  set value = value || jsonb_build_object(
    'enabled', true,
    'hours', jsonb_build_object(
      'start', '18:00',
      'end', '23:00',
      'days', jsonb_build_array(1, 2, 3, 4, 5, 6, 7)
    ),
    'pausedMessage', 'Atendemos de 6 a 11 pm, todos los días.'
  )
  where key = 'courier';

create or replace function public.is_within_courier_schedule() returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_start time;
  v_end time;
  v_now timestamp := now() at time zone 'America/Lima';
  v_t time := v_now::time;
  v_dow int;
begin
  select value -> 'hours' into v from public.app_settings where key = 'courier';
  if v is null then return false; end if;
  v_start := (v ->> 'start')::time;
  v_end := (v ->> 'end')::time;

  -- El día que cuenta es el de la APERTURA: si algún día el horario cruza la
  -- medianoche, la 1 am del domingo pertenece a la noche del sábado.
  v_dow := extract(isodow from case
    when v_end <= v_start and v_t < v_end then v_now - interval '1 day'
    else v_now
  end)::int;
  if jsonb_typeof(v -> 'days') = 'array'
     and not (v -> 'days') @> to_jsonb(v_dow) then
    return false;
  end if;

  if v_end > v_start then
    return v_t >= v_start and v_t < v_end;
  else
    return v_t >= v_start or v_t < v_end; -- cruza medianoche
  end if;
end;
$$;
grant execute on function public.is_within_courier_schedule() to anon, authenticated, service_role;

-- ── 2 · Sin descuentos ──────────────────────────────────────────────────────

update public.app_settings
  set value = value || '{"active": false}'::jsonb
  where key = 'promo_free_delivery';

update public.menu_items
  set free_delivery_days = null,
      free_delivery_until = null
  where free_delivery_days is not null
     or free_delivery_until is not null;

-- ── 3 · Los pasos de una entrega viajan al outbox ───────────────────────────
-- Solo los pasos que alguien espera. Los intermedios de un mismo botón
-- (`depart`, `arrive`, `collect_transport`, `depart_dropoff`) y
-- `report_problem` se quedan en la auditoría: «Recogido» ya los dispara todos
-- seguidos, y avisar de cada uno serían cuatro pushes por un solo toque.

create or replace function public.courier_event_to_outbox() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_action text := substring(new.event_type from '^courier\.(.+)$');
begin
  if v_action is null or v_action not in (
    'requested',                 -- entrega nueva (motorizados)
    'release',                   -- vuelve a la bolsa (el resto de motorizados)
    'accept',                    -- un motorizado la tomó (cliente)
    'pick_up',                   -- ya la recogió (cliente)
    'deliver',                   -- llegó (cliente)
    'cancel',                    -- no se pudo (cliente)
    'expired',                   -- nadie la tomó a tiempo (cliente)
    'fee_remittance_confirmed'   -- Jesús confirmó la rendición (motorizado)
  ) then
    return new;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values (
    'courier_order',
    new.courier_order_id,
    'CourierStepped',
    coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
      'action', v_action,
      'actorRole', new.actor_role,
      'actorUserId', new.actor_user_id
    )
  );
  return new;
end;
$$;
revoke all on function public.courier_event_to_outbox() from public, anon, authenticated;

drop trigger if exists courier_event_to_outbox on public.courier_order_events;
create trigger courier_event_to_outbox
  after insert on public.courier_order_events
  for each row execute function public.courier_event_to_outbox();

-- `dispatch_event` idéntica a la 0212 salvo `CourierStepped` en la lista.
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
  -- `CustomerNoShow`, `OrderPrepExtended`, `order/appeal.created`) es
  -- auditoria: se queda en el outbox y no viaja.
  if new.event_type not in (
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- pedido nuevo (negocio) + aviso anticipado (motorizado)
    'OrderQueued',          -- entro a la bandeja por reloj (motorizados)
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfria (motorizados)
    'OrderProofVerified',   -- la cajera aprobo el comprobante (cliente)
    'OrderValidated',       -- el pedido paso el antifraude (cliente)
    'TransferRequested',    -- te piden tu pedido (dueño)
    'TransferResolved',     -- aceptado / rechazado / vencido (uno o los dos)
    'CashDelivered',        -- el motorizado declara efectivo (negocio)
    'CashConfirmed',        -- el negocio confirma (motorizado)
    'CashDisputed',         -- el negocio reporta diferencia (motorizado)
    'CashResolved',         -- Tindivo cierra el caso (motorizado)
    'CourierStepped'        -- Tindivo Entregas (motorizados y cliente)
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

-- ── 4 · Vencer registra solo lo que venció ESTA llamada ─────────────────────

create or replace function public.expire_courier_orders() returns int
  language plpgsql security definer set search_path = ''
as $$
declare
  v_minutes int;
  v_count int;
begin
  select coalesce((value ->> 'courierAcceptMinutes')::int, 15) into v_minutes
    from public.app_settings where key = 'timers';

  with expired as (
    update public.courier_orders
      set status = 'cancelled', cancelled_at = now(), cancel_reason = 'no_driver'
      where status = 'requested' and created_at < now() - (v_minutes || ' minutes')::interval
      returning id
  ), logged as (
    insert into public.courier_order_events (courier_order_id, event_type, actor_role, data)
    select id, 'courier.expired', 'system', '{}'::jsonb from expired
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end;
$$;
grant execute on function public.expire_courier_orders() to anon, authenticated, service_role;
