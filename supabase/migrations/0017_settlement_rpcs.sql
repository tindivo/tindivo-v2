-- =============================================================================
-- 0017 · Liquidación semanal de comisiones (negocio -> Tindivo)
-- generate_settlements: el admin genera la "factura" del período por negocio
-- (suma de comisión de pedidos ENTREGADOS, fecha en zona Lima). Idempotente
-- (UNIQUE business+período). No genera S/0 (Documento §5).
-- pay_settlement: registra el pago -> inserta restaurant_payment, cuyo trigger
-- descuenta balance_due y AUTODESBLOQUEA por mora. Idempotente.
-- Solo service_role. (balance_due ya acumula por trigger al entregar.)
-- =============================================================================

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

revoke execute on function public.generate_settlements(date, date, date, uuid) from public, anon, authenticated;
grant execute on function public.generate_settlements(date, date, date, uuid) to service_role;

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
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  -- Idempotente: si ya está pagada/cancelada, no hace nada.
  if v_s.status not in ('pending', 'overdue') then
    return jsonb_build_object('paid', false, 'status', v_s.status);
  end if;

  -- El pago dispara trg_restaurant_payments_decrement_balance (descuenta balance
  -- y desbloquea por mora si quedó en 0).
  insert into public.restaurant_payments (
    business_id, settlement_id, amount, payment_method, paid_at, registered_by, note
  ) values (
    v_s.business_id, v_s.id, v_s.total_amount, p_method, now(), p_paid_by, p_note
  );

  update public.settlements
    set status = 'paid', paid_at = now(), paid_by = p_paid_by,
        payment_method = p_method, payment_note = p_note, updated_at = now()
    where id = p_settlement_id;

  return jsonb_build_object('paid', true, 'settlementId', p_settlement_id, 'amount', v_s.total_amount);
end;
$$;

revoke execute on function public.pay_settlement(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pay_settlement(uuid, uuid, text, text) to service_role;
