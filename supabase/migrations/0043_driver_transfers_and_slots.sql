-- =============================================================================
-- 0043 · Driver: backpack slots en pickup + transferencias entre motorizados.
-- 1) advance_order: el case 'pickup' acepta `slots` (1-3) en p_params y lo
--    persiste en orders.occupancy_slots. ADEMÁS restaura la acción 'no_show'
--    (añadida en 0014 y perdida por regresión en 0031, que redefinió la función
--    desde la base de 0012). Cuerpo = 0031 + bloque no_show de 0014 + slots.
-- 2) order_transfer_requests gana expires_at; RPCs request/respond/expire con
--    TTL configurable (app_settings.timers.transferTtlSeconds, default 30s) y
--    timeout-as-accept (spec v1: el silencio del dueño transfiere el pedido).
--    Estados transferibles: heading_to_restaurant / waiting_at_restaurant
--    (picked_up se excluye: la comida ya viaja en la otra moto y reasignar
--    rompería settlements de efectivo y la comisión ya snapshoteada).
-- 3) Failsafe pg_cron cada 1 min (el timer fino de 30s lo agenda Inngest).
-- Idempotente.
-- =============================================================================

-- ── 1 · order_transfer_requests.expires_at ───────────────────────────────────

alter table public.order_transfer_requests
  add column if not exists expires_at timestamptz;

update public.order_transfer_requests
  set expires_at = created_at + interval '30 seconds'
  where status = 'pending' and expires_at is null;

create index if not exists otr_pending_expires_idx
  on public.order_transfer_requests (expires_at)
  where status = 'pending';

-- TTL tuneable junto al resto de timers.
update public.app_settings
  set value = value || '{"transferTtlSeconds": 30}'::jsonb
  where key = 'timers' and not (value ? 'transferTtlSeconds');

-- ── 2 · advance_order: 0031 + no_show (0014) + slots en pickup ────────────────

create or replace function public.advance_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_params jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commissions jsonb;
  v_prep int;
  v_slots int;
  v_blocked boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  select * into v_business from public.businesses where id = v_order.business_id;

  if p_actor_role = 'business' then
    if v_business.user_id <> p_actor_user_id then
      raise exception 'No autorizado sobre este pedido' using errcode = 'P0001';
    end if;
  elsif p_actor_role = 'driver' then
    select id into v_driver_id from public.drivers where user_id = p_actor_user_id;
    if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;
  end if;

  case p_action
    when 'accept' then
      if p_actor_role <> 'business' then raise exception 'Acción solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'pending_acceptance' then raise exception 'El pedido no esta pendiente de aceptacion' using errcode = 'P0001'; end if;
      v_new_status := 'confirmed';
    when 'preparing' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'confirmed' then raise exception 'El pedido no esta confirmado' using errcode = 'P0001'; end if;
      v_prep := greatest(1, coalesce((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';
    when 'ready' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'preparing' then raise exception 'El pedido no esta en preparacion' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_driver';
    when 'take' then
      if p_actor_role <> 'driver' then raise exception 'Accion solo del motorizado' using errcode = 'P0001'; end if;
      if v_order.status not in ('preparing', 'waiting_driver') then raise exception 'El pedido no esta disponible para tomar' using errcode = 'P0001'; end if;
      if v_order.driver_id is not null and v_order.driver_id <> v_driver_id then raise exception 'El pedido ya tiene motorizado' using errcode = 'P0001'; end if;
      v_new_status := 'heading_to_restaurant';
    when 'arrived' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'heading_to_restaurant' then raise exception 'El motorizado no va al local' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_at_restaurant';
    when 'pickup' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'waiting_at_restaurant' then raise exception 'El pedido no esta listo para recoger' using errcode = 'P0001'; end if;
      v_band := (p_params ->> 'band')::public.distance_band;
      if v_order.delivery_method = 'delivery' and v_band is null then
        raise exception 'Declara la banda (cerca/lejos)' using errcode = 'P0001';
      end if;
      v_slots := least(3, greatest(1, coalesce((p_params ->> 'slots')::int, 1)));
      v_new_status := 'picked_up';
    when 'deliver' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'El pedido no esta recogido' using errcode = 'P0001'; end if;
      v_new_status := 'delivered';
    when 'no_show' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'Solo se reporta no-show con el pedido en reparto' using errcode = 'P0001'; end if;
      v_new_status := 'cancelled';
    when 'cancel' then
      if p_actor_role not in ('business', 'admin') then raise exception 'No autorizado para cancelar' using errcode = 'P0001'; end if;
      if v_order.status in ('delivered', 'cancelled') then raise exception 'El pedido ya esta cerrado' using errcode = 'P0001'; end if;
      v_new_status := 'cancelled';
    else
      raise exception 'Accion desconocida: %', p_action using errcode = 'P0001';
  end case;

  if p_action = 'take' then
    update public.orders set status = v_new_status, driver_id = v_driver_id where id = p_order_id;
  elsif p_action = 'preparing' then
    update public.orders
      set status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - 10) || ' minutes')::interval
      where id = p_order_id;
  elsif p_action = 'pickup' then
    select value into v_commissions from public.app_settings where key = 'commissions';
    if v_order.delivery_method = 'pickup' then
      v_commission := coalesce(v_business.commission_override_pickup, (v_commissions ->> 'pickup')::numeric, 0.50);
    elsif v_band = 'near' then
      v_commission := coalesce(v_business.commission_override_near, (v_commissions ->> 'near')::numeric, 3.00);
    else
      v_commission := coalesce(v_business.commission_override_far, (v_commissions ->> 'far')::numeric, 3.50);
    end if;
    update public.orders
      set status = v_new_status, delivery_distance_band = v_band, tindivo_commission = v_commission,
          occupancy_slots = v_slots
      where id = p_order_id;
  elsif p_action = 'deliver' then
    update public.orders
      set status = v_new_status,
          payment_real = coalesce((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      where id = p_order_id;
  elsif p_action = 'no_show' then
    update public.orders
      set status = v_new_status, cancel_reason = 'no_show', cancelled_by = p_actor_user_id
      where id = p_order_id;
    -- Strike anclado a número + dirección (atómico con la cancelación).
    insert into public.customer_strikes (
      customer_user_id, phone, delivery_reference,
      delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
    ) values (
      v_order.customer_user_id, v_order.customer_phone, v_order.delivery_reference,
      v_order.delivery_coordinates_lat, v_order.delivery_coordinates_lng, p_order_id, 'no_show', p_actor_user_id
    );
    v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, v_order.delivery_reference);
    if v_blocked and v_order.customer_user_id is not null then
      update public.customer_profiles
        set contraentrega_blocked = true,
            strikes = (select count(*) from public.customer_strikes where phone = v_order.customer_phone)
        where user_id = v_order.customer_user_id;
    end if;
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', v_order.delivery_reference, 'blocked', v_blocked
    ));
  elsif p_action = 'cancel' then
    update public.orders
      set status = v_new_status,
          cancel_reason = coalesce((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled'),
          cancel_note = nullif(p_params ->> 'reasonText', ''),
          cancelled_by = p_actor_user_id,
          rejection_reason_code = nullif(p_params ->> 'reasonCode', ''),
          rejection_reason_text = nullif(p_params ->> 'reasonText', ''),
          rejected_at = now(),
          rejected_by = p_actor_user_id
      where id = p_order_id;
  else
    update public.orders set status = v_new_status where id = p_order_id;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);

  return (
    select jsonb_build_object(
      'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
      'band', delivery_distance_band, 'tindivoCommission', tindivo_commission,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason
    ) from public.orders where id = p_order_id
  );
end;
$$;

revoke execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) from public, anon, authenticated;
grant execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) to service_role;

-- ── 3 · Transferencias entre motorizados ──────────────────────────────────────

-- Helper interno (sin grant): aplica la transferencia y cierra solicitudes.
create or replace function public.apply_order_transfer(
  p_req public.order_transfer_requests,
  p_final public.transfer_request_status   -- 'accepted' | 'expired' (timeout-as-accept)
) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.orders set driver_id = p_req.to_driver_id where id = p_req.order_id; -- estado intacto
  update public.order_transfer_requests set status = p_final, resolved_at = now() where id = p_req.id;
  update public.order_transfer_requests set status = 'invalidated', resolved_at = now()
    where order_id = p_req.order_id and status = 'pending' and id <> p_req.id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_req.order_id, 'TransferResolved', jsonb_build_object(
    'requestId', p_req.id, 'resolution', p_final,
    'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_req.order_id,
          case when p_final = 'expired' then 'order.transfer_timeout_accepted' else 'order.transfer_accepted' end,
          'driver', null,
          jsonb_build_object('requestId', p_req.id,
            'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id));
end;
$$;

-- El solicitante es el RECEPTOR: pide absorber un pedido activo del compañero.
create or replace function public.request_order_transfer(
  p_to_driver_user_id uuid,
  p_order_id uuid,
  p_reason text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_to_driver public.drivers;
  v_available boolean;
  v_ttl int;
  v_req public.order_transfer_requests;
begin
  select * into v_to_driver from public.drivers
    where user_id = p_to_driver_user_id and is_active;
  if not found then raise exception 'Motorizado no encontrado o inactivo' using errcode = 'P0001'; end if;

  select is_available into v_available from public.driver_availability where driver_id = v_to_driver.id;
  if not coalesce(v_available, false) then
    raise exception 'Debes estar disponible para pedir una transferencia' using errcode = 'P0001';
  end if;

  -- Lock en orden consistente con advance_order: SIEMPRE orders primero.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.driver_id is null then
    raise exception 'El pedido no tiene motorizado: tomalo de la cola' using errcode = 'P0001';
  end if;
  if v_order.driver_id = v_to_driver.id then
    raise exception 'El pedido ya es tuyo' using errcode = 'P0001';
  end if;
  if v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    raise exception 'El pedido no esta en un estado transferible' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.driver_restaurants
                 where driver_id = v_to_driver.id and business_id = v_order.business_id) then
    raise exception 'No estas autorizado para este negocio' using errcode = 'P0001';
  end if;

  select coalesce((value ->> 'transferTtlSeconds')::int, 30) into v_ttl
    from public.app_settings where key = 'timers';
  v_ttl := coalesce(v_ttl, 30);

  insert into public.order_transfer_requests (order_id, from_driver_id, to_driver_id, reason, expires_at)
  values (p_order_id, v_order.driver_id, v_to_driver.id, nullif(p_reason, ''),
          now() + make_interval(secs => v_ttl))
  returning * into v_req;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'TransferRequested', jsonb_build_object(
    'requestId', v_req.id, 'fromDriverId', v_req.from_driver_id, 'toDriverId', v_req.to_driver_id,
    'expiresAt', v_req.expires_at));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.transfer_requested', 'driver', p_to_driver_user_id,
          jsonb_build_object('requestId', v_req.id, 'reason', p_reason));

  return jsonb_build_object('id', v_req.id, 'orderId', p_order_id, 'status', v_req.status,
                            'expiresAt', v_req.expires_at);
exception when unique_violation then
  raise exception 'Ya tienes una solicitud pendiente sobre este pedido' using errcode = 'P0001';
end;
$$;

-- El dueño actual responde. Si la solicitud ya venció, silencio = aceptar.
create or replace function public.respond_order_transfer(
  p_request_id uuid,
  p_responder_user_id uuid,
  p_accept boolean
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_driver_id uuid;
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

  -- Expiración perezosa: aunque llegue un reject tardío, el silencio ya aceptó.
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    perform public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', true);
  end if;

  if p_accept then
    perform public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', true);
  end if;

  update public.order_transfer_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_req.order_id, 'TransferResolved',
          jsonb_build_object('requestId', p_request_id, 'resolution', 'rejected'));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_req.order_id, 'order.transfer_rejected', 'driver', p_responder_user_id,
          jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'transferred', false);
end;
$$;

-- Barrido idempotente: pending vencidas -> timeout-as-accept (o invalidación).
create or replace function public.expire_order_transfers()
  returns int
  language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.order_transfer_requests;
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_count int := 0;
begin
  for v_row in
    select * from public.order_transfer_requests
    where status = 'pending' and expires_at is not null and expires_at <= now()
    order by expires_at
  loop
    -- Lock orders primero (consistente con advance_order); skip si ocupada.
    select * into v_order from public.orders where id = v_row.order_id for update skip locked;
    if not found then continue; end if;
    select * into v_req from public.order_transfer_requests
      where id = v_row.id and status = 'pending' for update skip locked;
    if not found then continue; end if;

    if v_order.driver_id is distinct from v_req.from_driver_id
       or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
      update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = v_req.id;
    else
      perform public.apply_order_transfer(v_req, 'expired');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.apply_order_transfer(public.order_transfer_requests, public.transfer_request_status) from public, anon, authenticated;
revoke all on function public.request_order_transfer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_order_transfer(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.expire_order_transfers() from public, anon, authenticated;
grant execute on function public.request_order_transfer(uuid, uuid, text) to service_role;
grant execute on function public.respond_order_transfer(uuid, uuid, boolean) to service_role;
grant execute on function public.expire_order_transfers() to service_role;

-- ── 4 · Failsafe: barrido cada minuto (el timer fino de 30s lo agenda Inngest) ─

do $$
begin
  perform cron.unschedule('expire-order-transfers');
exception
  when others then null;
end;
$$;
select cron.schedule('expire-order-transfers', '* * * * *', 'select public.expire_order_transfers();');
