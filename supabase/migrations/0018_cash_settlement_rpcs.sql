-- =============================================================================
-- 0018 · Liquidación diaria de efectivo (motorizado -> negocio)
-- El motorizado retiene el efectivo del turno y lo entrega al negocio que vendió
-- esos pedidos (Documento §12/6). Monto esperado = suma de (order_amount +
-- delivery_fee) de pedidos ENTREGADOS pagados en efectivo de ese negocio+driver+día
-- (zona Lima). El negocio confirma (cuenta físico) o disputa -> bandeja admin.
-- A las 24h sin confirmar -> auto_assumed_confirmed. Solo service_role.
-- Lecturas: negocio/driver via RLS (cs_business_read / cs_driver_read).
-- =============================================================================

-- Motorizado declara la entrega de efectivo del día a un negocio. Idempotente
-- por (business, driver, date): re-declarar actualiza el monto mientras no esté
-- cerrada. total_cash = esperado (derivado); delivered_amount = lo que declara.
create or replace function public.create_cash_settlement(
  p_driver_user_id uuid,
  p_business_id uuid,
  p_settlement_date date,
  p_delivered_amount numeric default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_expected numeric := 0;
  v_count int := 0;
  v_delivered numeric;
  v_existing public.cash_settlements;
  v_id uuid;
begin
  select id into v_driver_id from public.drivers where user_id = p_driver_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  select coalesce(sum(o.order_amount + o.delivery_fee), 0), count(*)
    into v_expected, v_count
  from public.orders o
  where o.business_id = p_business_id
    and o.driver_id = v_driver_id
    and o.status = 'delivered'
    and o.payment_real = 'paid_cash'
    and (o.delivered_at at time zone 'America/Lima')::date = p_settlement_date;

  v_delivered := coalesce(p_delivered_amount, v_expected);

  select * into v_existing from public.cash_settlements
    where business_id = p_business_id and driver_id = v_driver_id and settlement_date = p_settlement_date
    for update;

  if found and v_existing.status in ('confirmed', 'resolved', 'auto_assumed_confirmed') then
    raise exception 'La liquidación de efectivo de ese día ya está cerrada' using errcode = 'P0001';
  end if;

  if found then
    update public.cash_settlements
      set total_cash = v_expected, order_count = v_count, delivered_amount = v_delivered,
          delivered_at_ts = now(), status = 'pending_confirmation', updated_at = now()
      where id = v_existing.id returning id into v_id;
  else
    insert into public.cash_settlements (
      business_id, driver_id, settlement_date, total_cash, order_count,
      status, delivered_amount, delivered_at_ts
    ) values (
      p_business_id, v_driver_id, p_settlement_date, v_expected, v_count,
      'pending_confirmation', v_delivered, now()
    ) returning id into v_id;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', v_id, 'CashDelivered', jsonb_build_object(
    'businessId', p_business_id, 'driverId', v_driver_id, 'amount', v_delivered, 'expected', v_expected
  ));

  return jsonb_build_object(
    'id', v_id, 'expected', v_expected, 'orderCount', v_count,
    'deliveredAmount', v_delivered, 'status', 'pending_confirmation'
  );
end;
$$;

-- El negocio confirma el monto contado físicamente.
create or replace function public.confirm_cash_settlement(
  p_id uuid,
  p_business_user_id uuid,
  p_confirmed_amount numeric
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cs public.cash_settlements;
  v_biz uuid;
begin
  select * into v_cs from public.cash_settlements where id = p_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  select id into v_biz from public.businesses where user_id = p_business_user_id;
  if v_biz is null or v_biz <> v_cs.business_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  if v_cs.status <> 'pending_confirmation' then
    return jsonb_build_object('confirmed', false, 'status', v_cs.status);
  end if;

  update public.cash_settlements
    set status = 'confirmed', confirmed_amount = p_confirmed_amount, confirmed_at = now(),
        confirmed_by = p_business_user_id, updated_at = now()
    where id = p_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', p_id, 'CashConfirmed', jsonb_build_object('amount', p_confirmed_amount));

  return jsonb_build_object('confirmed', true, 'status', 'confirmed');
end;
$$;

-- El negocio reporta una diferencia -> disputa + reporte para la bandeja admin.
create or replace function public.dispute_cash_settlement(
  p_id uuid,
  p_business_user_id uuid,
  p_reported_amount numeric,
  p_note text
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cs public.cash_settlements;
  v_biz uuid;
begin
  select * into v_cs from public.cash_settlements where id = p_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  select id into v_biz from public.businesses where user_id = p_business_user_id;
  if v_biz is null or v_biz <> v_cs.business_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  if v_cs.status <> 'pending_confirmation' then
    raise exception 'La liquidación no está pendiente de confirmación' using errcode = 'P0001';
  end if;

  update public.cash_settlements
    set status = 'disputed', reported_amount = p_reported_amount, dispute_note = p_note,
        disputed_at = now(), updated_at = now()
    where id = p_id;

  insert into public.reports (type, status, business_id, driver_id, created_by, description)
  values ('cash_difference', 'open', v_cs.business_id, v_cs.driver_id, p_business_user_id,
    'Diferencia de efectivo: motorizado declaró S/ ' || v_cs.delivered_amount ||
    ', negocio contó S/ ' || p_reported_amount || coalesce('. ' || p_note, ''));

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', p_id, 'CashDisputed', jsonb_build_object(
    'declared', v_cs.delivered_amount, 'reported', p_reported_amount
  ));

  return jsonb_build_object('disputed', true, 'status', 'disputed');
end;
$$;

-- El admin resuelve la disputa con un monto final.
create or replace function public.resolve_cash_settlement(
  p_id uuid,
  p_admin_user_id uuid,
  p_resolved_amount numeric,
  p_note text
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cs public.cash_settlements;
begin
  select * into v_cs from public.cash_settlements where id = p_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  if v_cs.status <> 'disputed' then
    return jsonb_build_object('resolved', false, 'status', v_cs.status);
  end if;

  update public.cash_settlements
    set status = 'resolved', resolved_amount = p_resolved_amount, resolved_at = now(),
        resolved_by = p_admin_user_id, resolution_note = p_note, updated_at = now()
    where id = p_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', p_id, 'CashResolved', jsonb_build_object('amount', p_resolved_amount));

  return jsonb_build_object('resolved', true, 'status', 'resolved');
end;
$$;

-- Inngest: a las 24h sin confirmar, se asume confirmado (evita limbo del driver).
create or replace function public.auto_confirm_cash_settlement(p_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.cash_settlement_status;
begin
  update public.cash_settlements
    set status = 'auto_assumed_confirmed', confirmed_at = now(), updated_at = now()
    where id = p_id and status = 'pending_confirmation'
    returning status into v_status;
  if v_status is null then
    return jsonb_build_object('autoConfirmed', false);
  end if;
  return jsonb_build_object('autoConfirmed', true, 'status', 'auto_assumed_confirmed');
end;
$$;

revoke execute on function public.create_cash_settlement(uuid, uuid, date, numeric) from public, anon, authenticated;
revoke execute on function public.confirm_cash_settlement(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.dispute_cash_settlement(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.resolve_cash_settlement(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.auto_confirm_cash_settlement(uuid) from public, anon, authenticated;
grant execute on function public.create_cash_settlement(uuid, uuid, date, numeric) to service_role;
grant execute on function public.confirm_cash_settlement(uuid, uuid, numeric) to service_role;
grant execute on function public.dispute_cash_settlement(uuid, uuid, numeric, text) to service_role;
grant execute on function public.resolve_cash_settlement(uuid, uuid, numeric, text) to service_role;
grant execute on function public.auto_confirm_cash_settlement(uuid) to service_role;
