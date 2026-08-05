-- =============================================================================
-- ROLLBACK de 0123_contingency_is_gone_and_appeals_reach_the_ledger.sql
-- =============================================================================
--
-- NO ES UNA MIGRACIÓN. Vive en Docs/spec/ a propósito, para que `db push` no
-- lo aplique nunca. Se ejecuta a mano y solo si 0123 hay que revertirla.
--
-- POR QUÉ EXISTE. 0123 es la primera migración que BORRA en prod: un DROP TABLE,
-- dos DROP TYPE y seis DROP FUNCTION. Eso no se revierte solo, y escribir el
-- rollback después del incidente es escribirlo con prisa.
--
-- QUÉ RESTAURA Y QUÉ NO
--   ✅ La forma del esquema: tabla, tipos, índices, RLS, policies, trigger y las
--      siete funciones tal como estaban ANTES de 0123.
--   ❌ Los DATOS de contingency_advances. Un DROP TABLE se los lleva y esto no
--      los trae de vuelta. Medido el 2026-08-04 en prod: la tabla tiene 0 filas,
--      así que hoy no hay nada que perder. SI ALGUIEN APLICA 0123 CUANDO YA HAYA
--      FILAS, este archivo NO ALCANZA: hace falta un backup previo.
--   ⚠️ Restaura `register_appeal_refund(uuid,numeric,text,uuid)` a su versión
--      ROTA (la de 0077, que compara contra el literal 'appeal' inexistente y
--      falla con 22P02 en toda llamada — ver M-6 en RIESGOS-LEDGER.md). Es el
--      estado real previo, no una mejora. El rollback restaura, no arregla.
--
-- ANTES DE EJECUTARLO
--   1. Revertir el código de acompañamiento (endpoint, enums, enum-drift,
--      limpiezas). Si no, el repo queda apuntando a lo que este archivo
--      deshace.
--   2. `pnpm db:types` después.
--
-- =============================================================================


-- ── 1 · Los tipos (0001_extensions_and_enums.sql:105-111) -------------------
do $$ begin
  create type public.contingency_advance_status as enum ('activo', 'disputado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contingency_actor_charged as enum ('restaurante', 'tindivo');
exception when duplicate_object then null; end $$;


-- ── 2 · La tabla (0002_tables.sql:521-541 + 0025:20) ------------------------
create table if not exists public.contingency_advances (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_user_id uuid references public.users(id),
  customer_phone text,
  amount decimal(10,2) not null,
  reason text not null,
  proof_url text,
  actor_charged public.contingency_actor_charged not null,
  status public.contingency_advance_status not null default 'activo',
  disputed_at timestamptz,
  dispute_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id),
  operator uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contingency_advances is 'Adelantos del fondo de contingencia (disputable 48h).';
alter table public.contingency_advances add column if not exists replenished_at timestamptz;
create index if not exists ca_order_idx on public.contingency_advances (order_id);
create index if not exists ca_status_idx on public.contingency_advances (status);

drop trigger if exists touch_contingency_advances on public.contingency_advances;
create trigger touch_contingency_advances
  before update on public.contingency_advances
  for each row execute function public.touch_updated_at();

alter table public.contingency_advances enable row level security;

drop policy if exists ca_admin_all on public.contingency_advances;
create policy ca_admin_all on public.contingency_advances
  for all using ((select public.current_user_has_role('admin')));

drop policy if exists ca_business_read on public.contingency_advances;
create policy ca_business_read on public.contingency_advances
  for select using (
    order_id in (select id from public.orders
                  where business_id = (select public.current_business_id()))
  );


-- ── 3 · Las tres funciones de contingencia (0077) ---------------------------
create or replace function public.create_contingency_advance(
  p_order_id uuid, p_amount numeric, p_reason text,
  p_actor_charged public.contingency_actor_charged, p_operator uuid,
  p_proof_url text default null
) returns jsonb language plpgsql security definer set search_path = ''
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

  -- OJO: la clave `contingency_fund` NO existe en app_settings desde 0077:169-174.
  -- Este UPDATE afecta 0 filas en silencio. Se restaura tal cual estaba.
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

create or replace function public.dispute_contingency_advance(
  p_advance_id uuid, p_business_user_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = ''
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

  -- OJO: con `contingency_fund` borrada, v_window queda NULL y esta guarda
  -- NUNCA se dispara. Se restaura tal cual estaba.
  select coalesce((value ->> 'disputeWindowHours')::int, 48) into v_window
    from public.app_settings where key = 'contingency_fund';
  if v_a.created_at < now() - (v_window || ' hours')::interval then
    raise exception 'La ventana de disputa (% h) ya venció', v_window using errcode = 'P0001';
  end if;

  update public.contingency_advances
    set status = 'disputado', disputed_at = now(), dispute_note = p_note, updated_at = now()
    where id = p_advance_id;

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

create or replace function public.resolve_contingency_advance(
  p_advance_id uuid, p_resolved_by uuid, p_resolved_amount numeric, p_note text
) returns jsonb language plpgsql security definer set search_path = ''
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

-- Grants tal como los dejó 0077 (revocados de todos los roles de aplicación).
revoke all on function public.create_contingency_advance(
  uuid, numeric, text, public.contingency_actor_charged, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.dispute_contingency_advance(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_contingency_advance(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;


-- ── 4 · register_appeal_refund de 3 argumentos (0067:401) -------------------
create or replace function public.register_appeal_refund(
  p_report_id uuid, p_refund_proof_path text, p_amount numeric
) returns jsonb language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_report public.reports;
  v_order public.orders;
  v_expected_amount numeric;
  v_admin_user_id uuid;
BEGIN
  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto de devolución debe ser positivo' USING errcode = 'P0001';
  END IF;

  IF p_refund_proof_path IS NULL OR trim(p_refund_proof_path) = '' THEN
    RAISE EXCEPTION 'La ruta del comprobante de devolución es obligatoria' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no existe' USING errcode = 'P0002'; END IF;

  IF v_report.appeal_status <> 'approved' OR v_report.refund_status <> 'pending' THEN
    RAISE EXCEPTION 'Este reporte no está aprobado o ya fue reembolsado' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_report.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido asociado no existe' USING errcode = 'P0002'; END IF;

  v_expected_amount := COALESCE(v_order.order_amount, 0) + COALESCE(v_order.delivery_fee, 0);
  IF v_expected_amount <= 0 THEN
    RAISE EXCEPTION 'El pedido no cuenta con un monto reembolsable válido' USING errcode = 'P0001';
  END IF;

  IF p_amount <> v_expected_amount THEN
    RAISE EXCEPTION 'El monto expresado (S/ %) no coincide con el total del pedido (S/ %)', p_amount, v_expected_amount
      USING errcode = 'P0001';
  END IF;

  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  PERFORM public.create_contingency_advance(
    v_report.order_id,
    p_amount,
    'Devolución por apelación aprobada — comprobante rechazado erróneamente',
    'restaurante',
    v_admin_user_id,
    p_refund_proof_path
  );

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.refund_registered', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id, 'amount', p_amount, 'proofPath', p_refund_proof_path));

  RETURN jsonb_build_object('ok', true, 'refundCompleted', true);
END;
$$;

revoke all on function public.register_appeal_refund(uuid, text, numeric) from public, anon, service_role;
grant execute on function public.register_appeal_refund(uuid, text, numeric) to authenticated;


-- ── 5 · register_appeal_refund de 4 argumentos: vuelve a su versión ROTA ----
-- Restaura la de 0077, que compara contra el literal 'appeal' inexistente en el
-- enum report_type y falla con 22P02 en TODA llamada. Es el estado previo real.
-- Y vuelve a quedar sin grants explícitos, o sea ejecutable por PUBLIC (M-5).
create or replace function public.register_appeal_refund(
  p_report_id uuid, p_amount numeric, p_refund_proof_path text, p_admin_user_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_report public.reports;
  v_admin_user_id uuid := p_admin_user_id;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Monto inválido' USING errcode = 'P0001';
  END IF;

  IF p_refund_proof_path IS NULL OR trim(p_refund_proof_path) = '' THEN
    RAISE EXCEPTION 'Debe adjuntar la captura del Yape/Plin enviado al cliente' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado' USING errcode = 'P0002';
  END IF;

  IF v_report.type NOT IN ('appeal', 'prepay_refund_review') THEN
    RAISE EXCEPTION 'El reporte no es una apelación o revisión de devolución' USING errcode = 'P0001';
  END IF;

  IF v_report.status = 'resolved' OR v_report.refund_status = 'completed' THEN
    RAISE EXCEPTION 'La devolución de este reporte ya fue completada' USING errcode = 'P0001';
  END IF;

  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := auth.uid();
  END IF;

  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  IF v_report.business_id IS NOT NULL THEN
    INSERT INTO public.business_charges (
      business_id, order_id, report_id, charge_type, amount, description
    ) VALUES (
      v_report.business_id, v_report.order_id, p_report_id, 'refund_charge', p_amount,
      'Devolución por apelación aprobada — comprobante rechazado erróneamente'
    );

    UPDATE public.businesses
      SET balance_due = balance_due + p_amount
      WHERE id = v_report.business_id;
  END IF;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.refund_registered', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id, 'amount', p_amount, 'proofPath', p_refund_proof_path));

  RETURN jsonb_build_object('ok', true, 'reportId', p_report_id,
    'refundAmount', p_amount, 'refundStatus', 'completed');
END;
$$;


-- ── 6 · Las dos funciones de trigger huérfanas (0009 y 0077) ----------------
-- Se restauran SIN atarlas a ningún trigger, que es como estaban.
create or replace function public.update_business_balance() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE') then
    if old.status <> 'delivered' and new.status = 'delivered' then
      update public.businesses
        set balance_due = balance_due + coalesce(new.tindivo_commission, 0)
        where id = new.business_id;
    elsif old.status = 'delivered' and new.status <> 'delivered' then
      update public.businesses
        set balance_due = greatest(0, balance_due - coalesce(old.tindivo_commission, 0))
        where id = new.business_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_prepaid_cancel_auto_debt() returns trigger
  language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_amount numeric;
  v_reason text;
BEGIN
  IF new.payment_intent <> 'prepaid' THEN RETURN new; END IF;

  v_amount := COALESCE(new.order_amount, 0) + COALESCE(new.delivery_fee, 0);
  v_reason := COALESCE(new.cancel_reason::text, '');

  IF v_reason = 'no_show' OR v_reason = 'proof_rejected_final' THEN RETURN new; END IF;

  IF new.payment_proof_status = 'verified'
     AND v_amount > 0
     AND v_reason IN ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') THEN
    BEGIN
      INSERT INTO public.business_charges (business_id, order_id, charge_type, amount, description)
      VALUES (new.business_id, new.id, 'refund_charge', v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente');
      UPDATE public.businesses SET balance_due = balance_due + v_amount WHERE id = new.business_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.reports (
        type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
      ) VALUES (
        'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
        new.customer_phone,
        'Prepago verificado cancelado: la deuda automática falló (' || sqlerrm ||
          '). Registrar la devolución manualmente.',
        new.cancelled_by
      );
    END;
  END IF;

  RETURN new;
END;
$$;


-- ── 7 · resolve_fraud_claim: vuelve a escribir en el ledger paralelo --------
create or replace function public.resolve_fraud_claim(
  p_claim_id uuid, p_resolver uuid, p_approve boolean, p_note text default null
) returns public.fraud_coverage_claims
  language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_row public.fraud_coverage_claims;
  v_order public.orders;
BEGIN
  SELECT * INTO v_row FROM public.fraud_coverage_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim no existe' USING errcode = 'P0002'; END IF;
  IF v_row.status <> 'pending' THEN RETURN v_row; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_row.order_id;

  UPDATE public.fraud_coverage_claims
    SET status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::public.fraud_claim_status,
        resolved_at = now(), resolved_by = p_resolver, resolution_note = p_note, updated_at = now()
  WHERE id = p_claim_id
  RETURNING * INTO v_row;

  IF p_approve THEN
    INSERT INTO public.contingency_advances
      (order_id, customer_phone, amount, reason, actor_charged, status, operator)
    VALUES (
      v_row.order_id, COALESCE(v_order.customer_phone, ''), v_row.amount,
      'Cobertura de fraude aprobada: ' || v_row.reason, 'restaurante', 'activo', p_resolver
    );

    IF v_order.business_id IS NOT NULL THEN
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description, status
      ) VALUES (
        v_order.business_id, v_row.order_id, 'refund_charge', v_row.amount,
        'Devolución por cobertura de fraude — ' || v_row.reason, 'pending'
      );

      UPDATE public.businesses
        SET balance_due = balance_due + v_row.amount
        WHERE id = v_order.business_id;
    END IF;
  END IF;

  RETURN v_row;
END $$;


-- ── 8 · pay_settlement: vuelve la reposición del fondo ----------------------
create or replace function public.pay_settlement(
  p_settlement_id uuid, p_paid_by uuid, p_method text default 'yape', p_note text default null
) returns jsonb language plpgsql security definer set search_path = ''
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


-- ── 9 · Verificación del rollback ------------------------------------------
-- Debe devolver todo true y DOS filas de register_appeal_refund.
--
-- SELECT to_regclass('public.contingency_advances') IS NOT NULL AS tabla,
--        (SELECT count(*) FROM pg_type WHERE typname IN
--          ('contingency_advance_status','contingency_actor_charged')) = 2 AS tipos,
--        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--          WHERE n.nspname='public' AND p.proname LIKE '%contingency%') = 3 AS funcs;
--
-- SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='register_appeal_refund';
