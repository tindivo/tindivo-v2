-- =============================================================================
-- 0031 · Campos y RPCs para el rediseño del Dashboard del Negocio (Pedidos v3)
--   · Busy mode: businesses.accepting_orders_until (pausar pedidos web)
--   · Verificación de comprobante de prepago en orders
--   · Motivos de rechazo estructurados en orders
--   · Pedido manual con tiempo de preparación (nace en `preparing`)
--   · RPCs pause/resume del negocio
-- Idempotente (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- =============================================================================

-- ── 1 · Busy mode ────────────────────────────────────────────────────────────
alter table public.businesses
  add column if not exists accepting_orders_until timestamptz;

comment on column public.businesses.accepting_orders_until is
  'Modo ocupado: si es futuro (o infinity), el negocio está pausado y rechaza pedidos web nuevos. null = abierto.';

-- ── 2 · Verificación de comprobante de prepago ───────────────────────────────
alter table public.orders
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references public.users(id),
  add column if not exists payment_proof_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_proof_status_chk') then
    alter table public.orders
      add constraint orders_payment_proof_status_chk
      check (payment_proof_status is null
             or payment_proof_status in ('pending', 'verified', 'rejected'));
  end if;
end $$;

-- ── 3 · Motivos de rechazo estructurados ─────────────────────────────────────
alter table public.orders
  add column if not exists rejection_reason_code text,
  add column if not exists rejection_reason_text text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.users(id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_rejection_reason_code_chk') then
    alter table public.orders
      add constraint orders_rejection_reason_code_chk
      check (rejection_reason_code is null
             or rejection_reason_code in
                ('out_of_stock', 'closed', 'out_of_zone', 'invalid_proof', 'no_answer', 'other'));
  end if;
end $$;

-- ── 4 · validate_order: registra estado del comprobante (prepago) ────────────
create or replace function public.validate_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_pass boolean,
  p_reason text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.status <> 'validando' then
    return jsonb_build_object('ok', false, 'status', v_order.status);
  end if;
  if p_actor_role = 'business' then
    select * into v_business from public.businesses where id = v_order.business_id;
    if v_business.user_id <> p_actor_user_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  elsif p_actor_role <> 'admin' then
    raise exception 'Solo el negocio o admin validan' using errcode = 'P0001';
  end if;

  if p_pass then
    update public.orders
      set status = 'pending_acceptance',
          payment_proof_status = case when v_order.payment_intent = 'prepaid' then 'verified' else payment_proof_status end,
          payment_verified_at  = case when v_order.payment_intent = 'prepaid' then now() else payment_verified_at end,
          payment_verified_by  = case when v_order.payment_intent = 'prepaid' then p_actor_user_id else payment_verified_by end
      where id = p_order_id;
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'pending_acceptance');
  else
    update public.orders
      set status = 'cancelled',
          cancel_reason = 'validation_timeout',
          cancelled_by = p_actor_user_id,
          cancel_note = p_reason,
          payment_proof_status   = case when v_order.payment_intent = 'prepaid' then 'rejected' else payment_proof_status end,
          rejection_reason_code  = case when v_order.payment_intent = 'prepaid' then 'invalid_proof' else rejection_reason_code end,
          rejection_reason_text  = p_reason,
          rejected_at = now(),
          rejected_by = p_actor_user_id
      where id = p_order_id;
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail', 'status', 'cancelled'));
    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id, jsonb_build_object('reason', p_reason));
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
end;
$$;

-- ── 5 · advance_order: guarda motivos de rechazo estructurados en `cancel` ────
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
      v_new_status := 'picked_up';
    when 'deliver' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'El pedido no esta recogido' using errcode = 'P0001'; end if;
      v_new_status := 'delivered';
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
      set status = v_new_status, delivery_distance_band = v_band, tindivo_commission = v_commission
      where id = p_order_id;
  elsif p_action = 'deliver' then
    update public.orders
      set status = v_new_status,
          payment_real = coalesce((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      where id = p_order_id;
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
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes
    ) from public.orders where id = p_order_id
  );
end;
$$;

revoke execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) from public, anon, authenticated;
grant execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) to service_role;

-- ── 6 · create_business_manual_order: prep time + nace en `preparing` ─────────
-- Pedido manual = SOLO monto total (sin selección de platos). Se crea una única
-- línea-resumen. Nace en `preparing` con estimated_ready_at para entrar directo a
-- la columna "En cocina". Persiste vuelto (client_pays_with / change_to_give).
drop function if exists public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text, text);

create function public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_customer_name text,
  p_customer_phone text,
  p_order_amount numeric,
  p_prep_time_minutes int default 20,
  p_delivery_address text default null,
  p_delivery_reference text default null,
  p_notes text default null,
  p_client_pays_with numeric default null,
  p_yape_amount numeric default null,
  p_cash_amount numeric default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  if v_business.is_blocked then raise exception 'Tu cuenta está suspendida' using errcode = 'P0001'; end if;
  if not v_business.is_active then raise exception 'Negocio inactivo' using errcode = 'P0001'; end if;
  if coalesce(p_order_amount, 0) <= 0 then raise exception 'Monto inválido' using errcode = 'P0001'; end if;

  v_prep := greatest(1, coalesce(p_prep_time_minutes, 20));

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  v_cash_part := case
    when p_payment_intent = 'pending_cash' then p_order_amount
    when p_payment_intent = 'pending_mixed' then coalesce(p_cash_amount, 0)
    else 0 end;
  v_change := case
    when p_client_pays_with is not null and v_cash_part > 0
      then greatest(0, round(p_client_pays_with - v_cash_part, 2))
    else null end;

  insert into public.orders (
    business_id, customer_user_id, source, is_manual, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, business_notes,
    prep_time_minutes, confirmed_at, preparing_at, estimated_ready_at,
    appears_in_queue_at, client_pays_with, change_to_give, yape_amount, cash_amount
  ) values (
    v_business.id, null, 'business_manual', true, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_order_amount, v_delivery_fee, 'preparing', p_notes,
    v_prep, now(), now(), now() + make_interval(mins => v_prep),
    now() + make_interval(mins => greatest(0, v_prep - 10)),
    p_client_pays_with, v_change,
    case when p_payment_intent = 'pending_mixed' then p_yape_amount else null end,
    case when p_payment_intent in ('pending_cash', 'pending_mixed') then v_cash_part else null end
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  -- Línea-resumen (manual = solo monto total, sin desglose de platos).
  insert into public.customer_order_items (
    order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
    quantity, unit_price, line_total, note
  ) values (
    v_order_id, null, 'Pedido por teléfono', p_order_amount, 1, p_order_amount, p_order_amount, p_notes
  );

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id, 'manual', true,
    'orderAmount', p_order_amount, 'deliveryMethod', p_delivery_method, 'status', 'preparing'));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'business', p_business_user_id,
    jsonb_build_object('manual', true, 'prepMinutes', v_prep));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', 'preparing', 'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'total', p_order_amount + v_delivery_fee);
end;
$$;

revoke execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, text, text, numeric, int,
  text, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, text, text, numeric, int,
  text, text, text, numeric, numeric, numeric) to service_role;

-- ── 7 · Pause / resume del negocio (busy mode) ───────────────────────────────
create or replace function public.pause_business_orders(
  p_business_user_id uuid,
  p_minutes int default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_until timestamptz;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  if p_minutes is null then
    v_until := 'infinity'::timestamptz;   -- "Hasta que reactive"
  else
    v_until := now() + make_interval(mins => greatest(1, p_minutes));
  end if;
  update public.businesses set accepting_orders_until = v_until where id = v_business.id;
  return jsonb_build_object('acceptingOrdersUntil', v_until);
end;
$$;

create or replace function public.resume_business_orders(
  p_business_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  update public.businesses set accepting_orders_until = null where id = v_business.id;
  return jsonb_build_object('acceptingOrdersUntil', null);
end;
$$;

revoke execute on function public.pause_business_orders(uuid, int) from public, anon, authenticated;
grant execute on function public.pause_business_orders(uuid, int) to service_role;
revoke execute on function public.resume_business_orders(uuid) from public, anon, authenticated;
grant execute on function public.resume_business_orders(uuid) to service_role;
