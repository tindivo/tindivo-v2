-- ════════════════════════════════════════════════════════════════════════════
-- 0240 · Entregas abre en su horario aunque nadie esté «Disponible»
--
-- Hasta ahora, en horario y con el servicio encendido, Entregas seguía
-- cerrado si ningún motorizado tenía el interruptor «Disponible» prendido: la
-- card del home decía «Sin motorizados libres ahora» y `create_courier_order`
-- rechazaba con `courier_no_driver`. Decisión de Jesús (2026-10-01): en
-- horario se puede pedir siempre.
--
-- Es lo mismo que ya pasa con la comida: el aviso llega a TODOS los
-- motorizados activos sin mirar `is_available` (ver «notificar no es asignar»
-- en `send-push`). El interruptor apagado no puede esconder el servicio,
-- porque es justo el aviso el que hace que alguien abra la app y lo prenda. Y
-- si de verdad no hay nadie, la solicitud vence a los 15 min sin cobro.
--
-- `courier_has_available_driver()` se queda: no la llama nadie más que estas
-- dos funciones, pero borrarla rompería un deploy con la API anterior.
--
-- Idempotente: `create or replace`, misma firma que la 0235.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Estado público: abierto = encendido + en horario ────────────────────

create or replace function public.courier_service_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_enabled boolean;
begin
  select value into v_courier from public.app_settings where key = 'courier';
  v_enabled := coalesce((v_courier ->> 'enabled')::boolean, false);
  return jsonb_build_object(
    'enabled', v_enabled,
    'openNow', v_enabled and public.is_within_courier_schedule(),
    'hours', v_courier -> 'hours',
    'price', coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00),
    'pausedMessage', v_courier ->> 'pausedMessage'
  );
end;
$$;
grant execute on function public.courier_service_status() to anon, authenticated, service_role;

-- ── 2 · Crear: sin el guard de motorizado disponible ────────────────────────

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
  p_utm_source text default null,
  p_driver_note text default null
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
  -- 0235: `is not true` y no `not`: con NULL, `if not null` no entra y la
  -- confirmación se saltaría (auditoría de Codex).
  if p_weight_confirmed is not true then
    raise exception 'Falta confirmar que lo que envías está permitido' using errcode = 'P0001';
  end if;
  if p_prepaid_confirmed is not true then
    raise exception 'Falta confirmar que ya pagaste tu pedido' using errcode = 'P0001';
  end if;

  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null or coalesce((v_courier ->> 'enabled')::boolean, false) = false then
    raise exception 'courier_disabled' using errcode = 'P0001';
  end if;

  if not public.is_within_courier_schedule() then
    raise exception 'courier_closed' using errcode = 'P0001';
  end if;

  -- 0240: ya NO se exige un motorizado «disponible». La solicitud se crea y
  -- avisa por push a todos los motorizados activos (notificar no es asignar);
  -- si nadie la toma en `courierAcceptMinutes`, se cancela sola sin cobro.

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
    -- 0235: serializa por celular ANTES de contar. Sin esto, dos solicitudes
    -- simultáneas del mismo celular cuentan 0 cada una y entran las dos.
    perform pg_advisory_xact_lock(hashtext('courier_phone:' || p_requester_phone));
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
    utm_source, driver_note
  ) values (
    v_short_id, p_customer_user_id, p_requester_name, p_requester_phone,
    p_directory_business_id,
    p_origin_name, p_origin_phone, p_origin_lat, p_origin_lng, p_origin_reference_text,
    p_destination_name, p_destination_phone, p_destination_lat, p_destination_lng, p_destination_reference_text,
    p_item_description, p_is_fragile, 0, now(),
    p_payer, v_fee, v_distance_m, p_weight_confirmed, p_prepaid_confirmed,
    p_utm_source, nullif(btrim(p_driver_note), '')
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

-- Permisos de la 0233, repetidos: `create or replace` los devuelve a anon.
revoke execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) to service_role;
