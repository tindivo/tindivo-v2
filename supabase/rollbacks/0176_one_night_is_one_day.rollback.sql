-- ROLLBACK de 0176 — vuelta a la fecha de calendario en las dos funciones.
--
-- OJO CON LO QUE ESTE ROLLBACK **NO** DESHACE: el backfill.
--
-- `settlement_date` se queda con la jornada en las filas que el backfill tocó.
-- Es deliberado: revertir el dato pediría recalcular el cast natural sobre cada
-- pedido enlazado, y una liquidación de la época multi-pedido (0111) no tiene un
-- único valor al que volver. Como el backfill movió CERO filas cuando 0176 se
-- escribió, en la práctica no hay nada que devolver salvo que hayan entrado
-- entregas de madrugada entre medias — y en ese caso el dato correcto es el que
-- deja 0176, no el que había.
--
-- Si de verdad hace falta revertir el dato, el criterio es
-- `(delivered_at at time zone 'America/Lima')::date` por liquidación, y hay que
-- decidir a mano qué hacer con las que cubran dos jornadas.

-- ── deliver_order_cash: cast natural ─────────────────────────────────────────
-- Solo cambia la línea de `v_date`; el resto es idéntico a 0176/0157.

create or replace function public.deliver_order_cash(
  p_driver_user_id uuid,
  p_order_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_order public.orders;
  v_owed numeric;
  v_date date;
  v_open_status public.cash_settlement_status;
  v_id uuid;
begin
  select id into v_driver_id from public.drivers where user_id = p_driver_user_id;
  if v_driver_id is null then
    raise exception 'Motorizado no encontrado' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_order.driver_id is distinct from v_driver_id then
    raise exception 'Ese pedido no es tuyo' using errcode = 'P0001';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'El pedido todavía no está entregado' using errcode = 'P0001';
  end if;

  v_owed := public.order_cash_owed(v_order);
  if v_owed is null or v_owed <= 0 then
    raise exception 'Ese pedido no lleva efectivo' using errcode = 'P0001';
  end if;

  if v_order.cash_settlement_id is not null then
    select status into v_open_status
      from public.cash_settlements where id = v_order.cash_settlement_id;
    if v_open_status in ('pending_confirmation', 'disputed') then
      return jsonb_build_object(
        'id', v_order.cash_settlement_id,
        'orderId', p_order_id,
        'amount', v_owed,
        'status', v_open_status,
        'alreadyDelivered', true
      );
    end if;
    raise exception 'El efectivo de ese pedido ya fue confirmado' using errcode = 'P0001';
  end if;

  v_date := (coalesce(v_order.delivered_at, now()) at time zone 'America/Lima')::date;

  insert into public.cash_settlements (
    business_id, driver_id, settlement_date, total_cash, order_count,
    status, delivered_amount, delivered_at_ts
  ) values (
    v_order.business_id, v_driver_id, v_date, v_owed, 1,
    'pending_confirmation', v_owed, now()
  ) returning id into v_id;

  update public.orders set cash_settlement_id = v_id where id = p_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', v_id, 'CashDelivered', jsonb_build_object(
    'businessId', v_order.business_id,
    'driverId', v_driver_id,
    'orderId', p_order_id,
    'shortId', v_order.short_id,
    'customerName', v_order.customer_name,
    'amount', v_owed
  ));

  return jsonb_build_object(
    'id', v_id,
    'orderId', p_order_id,
    'amount', v_owed,
    'status', 'pending_confirmation',
    'alreadyDelivered', false
  );
end;
$$;

comment on function public.deliver_order_cash(uuid, uuid) is
  'El motorizado entrega el efectivo de UN pedido. Idempotente por orders.cash_settlement_id (0157).';

-- ── generate_settlements: cast natural ───────────────────────────────────────

create or replace function public.generate_settlements(
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_created_by uuid default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_period_end < p_period_start then
    raise exception 'Período inválido' using errcode = 'P0001';
  end if;

  insert into public.settlements (
    business_id, period_start, period_end, order_count, total_amount, due_date, created_by, status
  )
  select
    o.business_id, p_period_start, p_period_end,
    count(*), sum(o.tindivo_commission), p_due_date, p_created_by, 'pending'
  from public.orders o
  where o.status = 'delivered'
    and (o.delivered_at at time zone 'America/Lima')::date between p_period_start and p_period_end
    and o.tindivo_commission is not null
  group by o.business_id
  having sum(o.tindivo_commission) > 0
  on conflict (business_id, period_start, period_end) do nothing;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'businessId', business_id, 'orderCount', order_count,
      'totalAmount', total_amount, 'status', status, 'dueDate', due_date
    ) order by total_amount desc), '[]'::jsonb)
    from public.settlements
    where period_start = p_period_start and period_end = p_period_end
  );
end;
$$;

comment on function public.generate_settlements(date, date, date, uuid) is null;
