-- 0025_contingency_rpcs.sql
-- Fase E: Fondo de contingencia y adelantos (FASE-1 §10, Maestro §5).
-- Reserva (S/200–300) con la que Tindivo devuelve de inmediato al cliente cuando el
-- sistema falla, y la recupera del restaurante (o la absorbe). Trazabilidad por pedido.
--
-- Modelo de dinero (piloto):
--   · create: fondo -= monto; si lo carga el restaurante → balance_due += monto (aparece en su deuda).
--   · dispute (≤48h, solo cargo al restaurante): congela la deuda (balance_due -= monto) + reporte `advance_dispute`.
--   · resolve (admin): descongela al monto resuelto (0 = a favor del restaurante → Tindivo absorbe; >0 = mantenido/reducido).
--   · pay_settlement: al pagar, repone el fondo con los adelantos activos del restaurante y los limpia del balance_due
--     (el admin cobra el balance_due completo aunque el settlement itemice solo comisiones — simplificación de piloto).
-- Idempotente.

-- Semilla del fondo (no se pisa si ya existe; el monto real se siembra en go-live).
insert into public.app_settings (key, value)
values ('contingency_fund', jsonb_build_object('balance', 300, 'initial', 300, 'disputeWindowHours', 48))
on conflict (key) do nothing;

-- Marca de reposición: el adelanto cargado al restaurante se repuso al pagar su liquidación.
alter table public.contingency_advances add column if not exists replenished_at timestamptz;

-- ── Registrar adelanto del fondo ─────────────────────────────────────────────
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

  -- Descuenta del fondo (lock de la fila de config).
  select (value ->> 'balance')::numeric into v_fund from public.app_settings where key = 'contingency_fund' for update;
  v_fund := coalesce(v_fund, 0) - p_amount;
  update public.app_settings
    set value = jsonb_set(value, '{balance}', to_jsonb(v_fund)), updated_at = now(), updated_by = p_operator
    where key = 'contingency_fund';

  -- Si lo carga el restaurante, suma a su deuda.
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

-- ── Disputar adelanto (restaurante, ventana 48h) ─────────────────────────────
create or replace function public.dispute_contingency_advance(
  p_advance_id uuid,
  p_business_user_id uuid,
  p_note text
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.contingency_advances;
  v_order public.orders;
  v_biz public.businesses;
  v_window int;
begin
  select * into v_a from public.contingency_advances where id = p_advance_id for update;
  if not found then raise exception 'Adelanto no existe' using errcode = 'P0002'; end if;
  if v_a.actor_charged <> 'restaurante' then
    raise exception 'Solo se pueden disputar adelantos cargados al restaurante' using errcode = 'P0001';
  end if;
  if v_a.status <> 'activo' then
    raise exception 'El adelanto no está activo' using errcode = 'P0001';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then
    raise exception 'Describe el motivo de la disputa' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = v_a.order_id;
  select * into v_biz from public.businesses where id = v_order.business_id;
  if v_biz.user_id <> p_business_user_id then
    raise exception 'No autorizado sobre este adelanto' using errcode = 'P0001';
  end if;

  select coalesce((value ->> 'disputeWindowHours')::int, 48) into v_window
    from public.app_settings where key = 'contingency_fund';
  if v_a.created_at < now() - (v_window || ' hours')::interval then
    raise exception 'La ventana de disputa (% h) ya venció', v_window using errcode = 'P0001';
  end if;

  update public.contingency_advances
    set status = 'disputado', disputed_at = now(), dispute_note = p_note, updated_at = now()
    where id = p_advance_id;

  -- Congela la deuda: retira el monto del balance_due hasta que el admin resuelva.
  update public.businesses set balance_due = greatest(0, balance_due - v_a.amount) where id = v_biz.id;

  insert into public.reports (type, status, business_id, order_id, customer_user_id, customer_phone, description, created_by)
  values ('advance_dispute', 'open', v_biz.id, v_a.order_id, v_a.customer_user_id, v_a.customer_phone, p_note, p_business_user_id);

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_a.order_id, 'ContingencyAdvanceDisputed', jsonb_build_object('advanceId', p_advance_id, 'amount', v_a.amount));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_a.order_id, 'order.dispute_filed', 'business', p_business_user_id, jsonb_build_object('advanceId', p_advance_id));

  return jsonb_build_object('id', p_advance_id, 'status', 'disputado');
end;
$$;

-- ── Resolver disputa (admin) ─────────────────────────────────────────────────
create or replace function public.resolve_contingency_advance(
  p_advance_id uuid,
  p_resolved_by uuid,
  p_resolved_amount numeric,
  p_note text
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.contingency_advances;
  v_order public.orders;
  v_new_status public.contingency_advance_status;
begin
  select * into v_a from public.contingency_advances where id = p_advance_id for update;
  if not found then raise exception 'Adelanto no existe' using errcode = 'P0002'; end if;
  if v_a.status <> 'disputado' then raise exception 'El adelanto no está en disputa' using errcode = 'P0001'; end if;
  if p_resolved_amount is null or p_resolved_amount < 0 or p_resolved_amount > v_a.amount then
    raise exception 'Monto resuelto inválido (0 a %)', v_a.amount using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = v_a.order_id;
  v_new_status := case when p_resolved_amount = 0 then 'cancelado' else 'activo' end;

  update public.contingency_advances
    set status = v_new_status, amount = p_resolved_amount,
        resolved_at = now(), resolved_by = p_resolved_by, updated_at = now()
    where id = p_advance_id;

  -- Descongela la deuda al monto resuelto (0 = a favor del restaurante → Tindivo absorbe).
  if v_a.actor_charged = 'restaurante' and p_resolved_amount > 0 then
    update public.businesses set balance_due = balance_due + p_resolved_amount where id = v_order.business_id;
  end if;

  update public.reports
    set status = 'resolved', resolution_note = p_note, resolved_by = p_resolved_by, resolved_at = now(), updated_at = now()
    where type = 'advance_dispute' and order_id = v_a.order_id and status = 'open';

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_a.order_id, 'ContingencyAdvanceResolved',
    jsonb_build_object('advanceId', p_advance_id, 'resolvedAmount', p_resolved_amount, 'status', v_new_status));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_a.order_id, 'order.advance_resolved', 'admin', p_resolved_by,
    jsonb_build_object('resolvedAmount', p_resolved_amount, 'status', v_new_status));

  return jsonb_build_object('id', p_advance_id, 'status', v_new_status, 'resolvedAmount', p_resolved_amount);
end;
$$;

-- ── pay_settlement: + reposición del fondo y limpieza de adelantos del balance_due ──
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

  -- Reposición del fondo: recupera los adelantos activos cargados al restaurante (no repuestos)
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
      set value = jsonb_set(value, '{balance}', to_jsonb(((value ->> 'balance')::numeric) + v_repl)),
          updated_at = now(), updated_by = p_paid_by
      where key = 'contingency_fund';
    update public.businesses set balance_due = greatest(0, balance_due - v_repl) where id = v_s.business_id;
  end if;

  return jsonb_build_object('paid', true, 'settlementId', p_settlement_id,
    'amount', v_s.total_amount, 'fundReplenished', v_repl);
end;
$$;

-- Endurecimiento: solo service_role ejecuta (la API valida rol admin/negocio).
revoke all on function public.create_contingency_advance(uuid, numeric, text, public.contingency_actor_charged, uuid, text) from public, anon, authenticated;
revoke all on function public.dispute_contingency_advance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_contingency_advance(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.create_contingency_advance(uuid, numeric, text, public.contingency_actor_charged, uuid, text) to service_role;
grant execute on function public.dispute_contingency_advance(uuid, uuid, text) to service_role;
grant execute on function public.resolve_contingency_advance(uuid, uuid, numeric, text) to service_role;
