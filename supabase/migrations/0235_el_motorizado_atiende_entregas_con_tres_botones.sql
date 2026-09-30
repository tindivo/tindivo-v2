-- ════════════════════════════════════════════════════════════════════════════
-- 0235 · El motorizado atiende Entregas con tres botones
--
-- MVP de Tindivo Entregas (Docs/Entregas/mvp-entregas-v1.md). La 0232 dejó la
-- máquina de siete pasos (`advance_courier_order`); el motorizado, en la calle,
-- solo toca «Aceptar», «Recogido» y «Entregado» (más «No se pudo» y
-- «Soltar»). Esta migración:
--
--   1. `driver_courier_step`: un paso del motorizado = UNA transacción. Encadena
--      los pasos internos de `advance_courier_order` (salir → llegar → cobrar →
--      recoger) con la fila bloqueada, así que un corte de conexión no deja un
--      pedido a medias. Es idempotente: repetir un paso ya dado devuelve el
--      estado actual sin error, para que el reintento sea seguro.
--   2. Tope de entregas activas por motorizado (`courier.maxActivePerDriver`,
--      2 al lanzar), serializado por motorizado con un advisory lock: dos
--      «Aceptar» simultáneos no pueden pasar el tope.
--   3. Cobro con método obligatorio (`cash`|`yape`) y prohibido soltar una
--      entrega ya cobrada (el dinero no puede quedarse sin motorizado).
--   4. `create_courier_order`: «listo ahora» forzado en el servidor
--      (`ready_in_min = 0`), y la cuenta de Jesús que crea los pedidos de
--      WhatsApp (`courier.unlimitedRequesterUserIds`) queda fuera del límite
--      de 1 activo por teléfono.
--
-- Idempotente: fusiones de jsonb que no pisan claves existentes y
-- `create or replace` en las funciones.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Configuración ───────────────────────────────────────────────────────

update public.app_settings
  set value = value || '{"maxActivePerDriver": 2}'::jsonb
  where key = 'courier' and not (value ? 'maxActivePerDriver');

update public.app_settings
  set value = value || '{"unlimitedRequesterUserIds": []}'::jsonb
  where key = 'courier' and not (value ? 'unlimitedRequesterUserIds');

-- ── 2 · create_courier_order: listo ahora + cuenta de WhatsApp sin límite ──
-- Misma firma que la 0232 (se conservan los grants de la 0233). Solo cambian
-- dos cosas, marcadas con «0235».

create or replace function public.create_courier_order(
  p_customer_user_id uuid,
  p_requester_name text,
  p_requester_phone text,
  p_directory_business_id uuid,
  p_origin_name text,
  p_origin_phone text,
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_origin_reference_text text,
  p_destination_name text,
  p_destination_phone text,
  p_destination_lat numeric,
  p_destination_lng numeric,
  p_destination_reference_text text,
  p_item_description text,
  p_is_fragile boolean,
  p_ready_in_min int,
  p_payer public.courier_payer,
  p_weight_confirmed boolean,
  p_prepaid_confirmed boolean,
  p_utm_source text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_max_active int;
  v_fee numeric(10,2);
  v_distance_m numeric(10,2);
  v_short_id text;
  v_id uuid;
  v_order_number bigint;
  v_active_count int;
  v_unlimited boolean;
begin
  if not p_weight_confirmed then
    raise exception 'Falta confirmar que lo que envías está permitido' using errcode = 'P0001';
  end if;
  if not p_prepaid_confirmed then
    raise exception 'Falta confirmar que ya pagaste tu pedido' using errcode = 'P0001';
  end if;

  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null or coalesce((v_courier ->> 'enabled')::boolean, false) = false then
    raise exception 'courier_disabled' using errcode = 'P0001';
  end if;

  if not public.is_within_courier_schedule() then
    raise exception 'courier_closed' using errcode = 'P0001';
  end if;

  if not public.courier_has_available_driver() then
    raise exception 'courier_no_driver' using errcode = 'P0001';
  end if;

  if not public.point_in_coverage_polygon(p_origin_lat, p_origin_lng) then
    raise exception 'courier_out_of_zone:origin' using errcode = 'P0001';
  end if;
  if not public.point_in_coverage_polygon(p_destination_lat, p_destination_lng) then
    raise exception 'courier_out_of_zone:destination' using errcode = 'P0001';
  end if;

  -- 0235: la cuenta con la que Jesús carga los pedidos de WhatsApp no tiene
  -- límite. Cada pedido suyo es de un cliente distinto; con el límite, solo
  -- podría atender uno a la vez.
  v_unlimited := coalesce(v_courier -> 'unlimitedRequesterUserIds', '[]'::jsonb)
    ? p_customer_user_id::text;

  if not v_unlimited then
    v_max_active := coalesce((v_courier ->> 'maxActivePerPhone')::int, 1);
    select count(*) into v_active_count
      from public.courier_orders
      where requester_phone = p_requester_phone
        and status not in ('delivered', 'cancelled');
    if v_active_count >= v_max_active then
      raise exception 'courier_active_limit' using errcode = 'P0001';
    end if;
  end if;

  v_fee := coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00);
  v_distance_m := public.geo_distance_km(
    p_origin_lat::double precision, p_origin_lng::double precision,
    p_destination_lat::double precision, p_destination_lng::double precision
  ) * 1000;
  v_short_id := public.generate_courier_short_id();

  -- 0235: «listo y pagado» significa listo AHORA. `p_ready_in_min` se ignora:
  -- un pedido «para dentro de dos horas» bloquearía al motorizado.
  insert into public.courier_orders (
    short_id, customer_user_id, requester_name, requester_phone,
    directory_business_id,
    origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text,
    destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text,
    item_description, is_fragile, ready_in_min, ready_at,
    payer, fee_amount, distance_m, weight_confirmed, prepaid_confirmed,
    utm_source
  ) values (
    v_short_id, p_customer_user_id, p_requester_name, p_requester_phone,
    p_directory_business_id,
    p_origin_name, p_origin_phone, p_origin_lat, p_origin_lng, p_origin_reference_text,
    p_destination_name, p_destination_phone, p_destination_lat, p_destination_lng, p_destination_reference_text,
    p_item_description, p_is_fragile, 0, now(),
    p_payer, v_fee, v_distance_m, p_weight_confirmed, p_prepaid_confirmed,
    p_utm_source
  )
  returning id, order_number into v_id, v_order_number;

  insert into public.courier_order_events (courier_order_id, event_type, actor_role, actor_user_id, data)
  values (v_id, 'courier.requested', 'customer', p_customer_user_id,
    jsonb_build_object('feeAmount', v_fee, 'distanceM', v_distance_m));

  return jsonb_build_object(
    'id', v_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'requested',
    'feeAmount', v_fee,
    'distanceM', v_distance_m
  );
end;
$$;

-- ── 3 · driver_courier_step ─────────────────────────────────────────────────
-- Pasos: accept · pick_up · deliver · fail · release.
-- Cada rama llama a `advance_courier_order` (la única que escribe el estado)
-- dentro de ESTA transacción: o avanza todo, o nada.

create or replace function public.driver_courier_step(
  p_courier_order_id uuid,
  p_actor_user_id uuid,
  p_step text,
  p_payment_method text default null,
  p_cancel_reason public.courier_cancel_reason default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_row public.courier_orders;
  v_max_active int;
  v_active_count int;
begin
  select id into v_driver_id from public.drivers where user_id = p_actor_user_id;
  if v_driver_id is null then
    raise exception 'courier_driver_not_found' using errcode = 'P0001';
  end if;

  if p_step = 'accept' then
    -- Serializa los «Aceptar» del MISMO motorizado: sin esto, dos toques
    -- simultáneos cuentan 1 activa cada uno y los dos pasan el tope.
    perform pg_advisory_xact_lock(hashtext('courier_driver:' || v_driver_id::text));

    select * into v_row from public.courier_orders where id = p_courier_order_id for update;
    if v_row.id is null then
      raise exception 'courier_not_found' using errcode = 'P0001';
    end if;
    -- Idempotente: ya es mía y sigue viva.
    if v_row.driver_id = v_driver_id and v_row.status not in ('delivered', 'cancelled') then
      return jsonb_build_object('id', v_row.id, 'status', v_row.status);
    end if;

    select coalesce((value ->> 'maxActivePerDriver')::int, 2) into v_max_active
      from public.app_settings where key = 'courier';
    select count(*) into v_active_count
      from public.courier_orders
      where driver_id = v_driver_id and status not in ('requested', 'delivered', 'cancelled');
    if v_active_count >= coalesce(v_max_active, 2) then
      raise exception 'courier_driver_full' using errcode = 'P0001';
    end if;

    perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'accept');

  elsif p_step in ('pick_up', 'deliver', 'fail', 'release') then
    select * into v_row from public.courier_orders
      where id = p_courier_order_id for update;
    if v_row.id is null or v_row.driver_id is distinct from v_driver_id then
      -- Una entrega ajena o inexistente se ve igual: no se filtra cuál es cuál.
      raise exception 'courier_not_found' using errcode = 'P0001';
    end if;

    if p_step = 'pick_up' then
      if v_row.status in ('picked_up', 'heading_to_dropoff', 'delivered') then
        return jsonb_build_object('id', v_row.id, 'status', v_row.status);
      end if;
      if v_row.status = 'cancelled' then
        raise exception 'courier_invalid_transition' using errcode = 'P0001';
      end if;
      if v_row.status = 'accepted' then
        perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'depart');
      end if;
      if v_row.status in ('accepted', 'heading_to_pickup') then
        perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'arrive');
      end if;
      if v_row.payer = 'origin' and v_row.transport_collected_at is null then
        if p_payment_method is null or p_payment_method not in ('cash', 'yape') then
          raise exception 'courier_payment_method_required' using errcode = 'P0001';
        end if;
        perform public.advance_courier_order(
          p_courier_order_id, p_actor_user_id, 'collect_transport', null, p_payment_method);
      end if;
      perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'pick_up');

    elsif p_step = 'deliver' then
      if v_row.status = 'delivered' then
        return jsonb_build_object('id', v_row.id, 'status', v_row.status);
      end if;
      if v_row.status not in ('picked_up', 'heading_to_dropoff') then
        raise exception 'courier_invalid_transition' using errcode = 'P0001';
      end if;
      if v_row.status = 'picked_up' then
        perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'depart_dropoff');
      end if;
      if v_row.payer = 'destination' and v_row.transport_collected_at is null then
        if p_payment_method is null or p_payment_method not in ('cash', 'yape') then
          raise exception 'courier_payment_method_required' using errcode = 'P0001';
        end if;
        perform public.advance_courier_order(
          p_courier_order_id, p_actor_user_id, 'collect_transport', null, p_payment_method);
      end if;
      perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'deliver');

    elsif p_step = 'fail' then
      if v_row.status = 'cancelled' then
        return jsonb_build_object('id', v_row.id, 'status', v_row.status);
      end if;
      if p_cancel_reason is null or p_cancel_reason not in ('not_ready', 'unreachable', 'other') then
        raise exception 'courier_cancel_reason_required' using errcode = 'P0001';
      end if;
      perform public.advance_courier_order(
        p_courier_order_id, p_actor_user_id, 'cancel', p_cancel_reason);

    else -- release
      if v_row.transport_collected_at is not null then
        raise exception 'courier_release_after_collect' using errcode = 'P0001';
      end if;
      perform public.advance_courier_order(p_courier_order_id, p_actor_user_id, 'release');
      select * into v_row from public.courier_orders where id = p_courier_order_id;
      return jsonb_build_object('id', v_row.id, 'status', v_row.status);
    end if;

  else
    raise exception 'courier_unknown_step' using errcode = 'P0001';
  end if;

  select * into v_row from public.courier_orders where id = p_courier_order_id;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke execute on function public.driver_courier_step(
  uuid, uuid, text, text, public.courier_cancel_reason
) from public, anon, authenticated;
grant execute on function public.driver_courier_step(
  uuid, uuid, text, text, public.courier_cancel_reason
) to service_role;
