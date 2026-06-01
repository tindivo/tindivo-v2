-- 0026_contingency_fund_key_fix.sql
-- Corrige Fase E: el fondo usa la clave canónica `current` (seed 0006: {"initial":250,"current":250}),
-- no `balance`. Re-crea las 2 funciones que tocan el fondo y backfillea `disputeWindowHours`.
-- Idempotente.

-- Asegura la ventana de disputa tuneable dentro del objeto del fondo.
update public.app_settings
  set value = value || '{"disputeWindowHours": 48}'::jsonb
  where key = 'contingency_fund' and not (value ? 'disputeWindowHours');

create or replace function public.create_contingency_advance(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor_charged public.contingency_actor_charged,
  p_operator uuid,
  p_proof_url text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_id uuid;
  v_fund numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  insert into public.contingency_advances (
    order_id, customer_user_id, customer_phone, amount, reason, actor_charged, proof_url, operator, status
  ) values (
    p_order_id, v_order.customer_user_id, v_order.customer_phone, p_amount, p_reason,
    p_actor_charged, p_proof_url, p_operator, 'activo'
  ) returning id into v_id;

  -- Descuenta del fondo (clave `current`, lock de la fila de config).
  select (value ->> 'current')::numeric into v_fund from public.app_settings where key = 'contingency_fund' for update;
  v_fund := coalesce(v_fund, 0) - p_amount;
  update public.app_settings
    set value = jsonb_set(value, '{current}', to_jsonb(v_fund)), updated_at = now(), updated_by = p_operator
    where key = 'contingency_fund';

  if p_actor_charged = 'restaurante' then
    update public.businesses set balance_due = balance_due + p_amount where id = v_order.business_id;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'ContingencyAdvanceCreated', jsonb_build_object(
    'advanceId', v_id, 'amount', p_amount, 'actorCharged', p_actor_charged, 'reason', p_reason
  ));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.contingency_advance', 'admin', p_operator,
    jsonb_build_object('amount', p_amount, 'actorCharged', p_actor_charged, 'reason', p_reason));

  return jsonb_build_object('id', v_id, 'fundBalance', v_fund, 'actorCharged', p_actor_charged);
end;
$$;

create or replace function public.pay_settlement(
  p_settlement_id uuid,
  p_paid_by uuid,
  p_method text default 'yape',
  p_note text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_s public.settlements;
  v_repl numeric := 0;
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  if v_s.status not in ('pending', 'overdue') then
    return jsonb_build_object('paid', false, 'status', v_s.status);
  end if;

  insert into public.restaurant_payments (
    business_id, settlement_id, amount, payment_method, paid_at, registered_by, note
  ) values (
    v_s.business_id, v_s.id, v_s.total_amount, p_method, now(), p_paid_by, p_note
  );

  update public.settlements
    set status = 'paid', paid_at = now(), paid_by = p_paid_by,
        payment_method = p_method, payment_note = p_note, updated_at = now()
    where id = p_settlement_id;

  -- Reposición del fondo (clave `current`): recupera adelantos activos del restaurante (no repuestos)
  -- y los limpia de su deuda (el admin cobra el balance_due completo al liquidar).
  with repl as (
    update public.contingency_advances ca
      set replenished_at = now(), updated_at = now()
      from public.orders o
      where ca.order_id = o.id and o.business_id = v_s.business_id
        and ca.actor_charged = 'restaurante' and ca.status = 'activo' and ca.replenished_at is null
      returning ca.amount
  )
  select coalesce(sum(amount), 0) into v_repl from repl;

  if v_repl > 0 then
    update public.app_settings
      set value = jsonb_set(value, '{current}', to_jsonb(((value ->> 'current')::numeric) + v_repl)),
          updated_at = now(), updated_by = p_paid_by
      where key = 'contingency_fund';
    update public.businesses set balance_due = greatest(0, balance_due - v_repl) where id = v_s.business_id;
  end if;

  return jsonb_build_object('paid', true, 'settlementId', p_settlement_id,
    'amount', v_s.total_amount, 'fundReplenished', v_repl);
end;
$$;
