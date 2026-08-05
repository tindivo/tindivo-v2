-- =============================================================================
-- ROLLBACK de 0124_balance_due_is_derived_and_settlements_are_gone.sql
-- =============================================================================
--
-- NO ES UNA MIGRACIÓN. Vive en Docs/spec/ para que `db push` no lo aplique.
--
-- QUÉ RESTAURA Y QUÉ NO
--   ✅ La tabla `settlements`, sus dos columnas de FK, `pay_settlement`,
--      `generate_settlements`, `decrement_balance_on_payment` y su trigger.
--   ✅ El `UPDATE balance_due` manual en las cuatro funciones.
--   ✅ Borra el trigger y la función de recálculo.
--   ❌ Los DATOS de `settlements` y de las dos columnas `settlement_id`.
--      Un DROP se los lleva. Medido antes de aplicar 0124: 0 filas en
--      `settlements`, 0 `restaurant_payments` con `settlement_id` no nulo,
--      0 `business_charges` con `settlement_id` no nulo. Hoy no hay nada que
--      perder. SI ALGUIEN APLICA 0124 CUANDO YA HAYA FILAS, ESTO NO ALCANZA.
--   ⚠️ El saldo. 0124 hace un backfill que alinea `balance_due` con el ledger.
--      Este rollback NO restaura los valores previos: los deja como estén. Con
--      las cuatro funciones devueltas a su UPDATE manual, el saldo vuelve a
--      mantenerse a mano desde la siguiente escritura.
--
-- =============================================================================


-- ── PASO 1 · REVERTIR EL CÓDIGO PRIMERO. NO ES OPCIONAL ----------------------
--
-- 0124 no es solo SQL. El mismo commit borra endpoints, edita el panel y toca
-- los tests. Si el repo se queda en el estado post-0124 y la base vuelve atrás,
-- quedan una tabla y dos RPC que nadie puede invocar, y el panel sin su alerta.
--
--   git revert 177dc07728f78a44a39e701e5d823942cca8a177
--   pnpm db:types
--   pnpm type-check && pnpm test
--
-- Solo después ejecutar el SQL de abajo.
--
-- ESTE ARCHIVO NO TOCA NINGÚN ARCHIVO DE TEST, Y NO ES SU RESPONSABILIDAD.
-- Es SQL: revierte el esquema. El lado del código lo revierte el `git revert`
-- de arriba, que incluye:
--
--   · apps/api/app/api/v1/admin/settlements/          (los dos endpoints)
--   · apps/admin/components/admin/alerts-bell.tsx     (la señal de liquidaciones)
--   · apps/api/app/api/v1/admin/charges/summary/route.ts  (el filtro .neq)
--   · apps/api/lib/__tests__/helpers/ledger-fixtures.ts   (devuelve `settlement_id`
--     a la interfaz ChargeRow y a los dos .select(); sin eso, los tests leerían
--     una columna que el SQL de abajo vuelve a crear pero que el helper ya no pide)
--   · apps/api/lib/__tests__/pay-settlement.integration.test.ts  (lo restaura)
--   · apps/api/lib/__tests__/ledger-chain.integration.test.ts    (A2.5 vuelve a su
--     UPDATE manual de balance_due)
--   · apps/api/lib/__tests__/reconciliation.integration.test.ts  (lo borra: sin el
--     trigger de recálculo, esa reconciliación vuelve a fallar por diseño)
--
-- Ejecutar el SQL sin el revert deja un tercer estado que nadie ha probado.
--
-- =============================================================================


-- ── 2 · Fuera el recálculo automático ----------------------------------------
DROP TRIGGER IF EXISTS trg_business_charges_recalc_balance ON public.business_charges;
DROP FUNCTION IF EXISTS public.recalc_business_balance();


-- ── 3 · La tabla settlements y sus columnas ----------------------------------
CREATE TABLE IF NOT EXISTS public.settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  order_count int not null default 0,
  total_amount numeric(10,2) not null default 0,
  status text not null default 'pending',
  due_date date not null,
  paid_at timestamptz,
  paid_by uuid references public.users(id),
  payment_method text,
  payment_note text,
  excluded_reason text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, period_start, period_end)
);

ALTER TABLE public.business_charges
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.settlements(id);
CREATE INDEX IF NOT EXISTS idx_business_charges_settlement
  ON public.business_charges (settlement_id) WHERE settlement_id IS NOT NULL;

ALTER TABLE public.restaurant_payments
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.settlements(id);


-- ── 4 · decrement_balance_on_payment y su trigger (0003:308) -----------------
CREATE OR REPLACE FUNCTION public.decrement_balance_on_payment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
begin
  update public.businesses
    set balance_due = greatest(0, balance_due - new.amount),
        last_payment_at = new.paid_at
    where id = new.business_id;
  -- Desbloqueo automático por mora si quedó sin deuda (flag estructurado, no LIKE)
  update public.businesses
    set is_blocked = false, blocked_for_debt = false, block_reason = null
    where id = new.business_id
      and blocked_for_debt = true
      and balance_due = 0;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_restaurant_payments_decrement_balance ON public.restaurant_payments;
CREATE TRIGGER trg_restaurant_payments_decrement_balance
AFTER INSERT ON public.restaurant_payments
FOR EACH ROW EXECUTE FUNCTION public.decrement_balance_on_payment();

REVOKE EXECUTE ON FUNCTION public.decrement_balance_on_payment() FROM public, anon, authenticated;


-- ── 5 · generate_settlements (0017) ------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_settlements(
  p_period_start date, p_period_end date, p_due_date date, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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


-- ── 6 · pay_settlement, en su versión post-0123 ------------------------------
-- Sin el bloque de reposición del fondo de contingencia, que 0123 ya había
-- quitado. Restaurar la versión pre-0123 reintroduciría el doble decremento.
CREATE OR REPLACE FUNCTION public.pay_settlement(
  p_settlement_id uuid, p_paid_by uuid, p_method text DEFAULT 'yape', p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
declare
  v_s public.settlements;
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

  return jsonb_build_object('paid', true, 'settlementId', p_settlement_id,
    'amount', v_s.total_amount);
end;
$$;


-- ── 7 · Devolver el UPDATE manual a las cuatro funciones ---------------------

-- 7.1 generate_delivery_charges (con sus DOS UPDATE)
CREATE OR REPLACE FUNCTION public.generate_delivery_charges()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_commission numeric;
  v_delivery_fee numeric;
  v_short_id text;
BEGIN
  IF old.status <> 'delivered' AND new.status = 'delivered' THEN
    v_short_id := new.short_id;
    v_delivery_fee := COALESCE(new.delivery_fee_charged, new.delivery_fee, 0);
    v_commission := COALESCE(new.commission_amount, COALESCE(new.tindivo_commission, 0) - v_delivery_fee, 0);

    IF (v_delivery_fee + v_commission) <= 0 THEN
      RETURN new;
    END IF;

    IF v_delivery_fee > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'delivery_fee', v_delivery_fee,
         'Delivery fee pedido #' || v_short_id);
    END IF;

    IF v_commission > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'commission', v_commission,
         'Comisión pedido #' || v_short_id);
    END IF;

    UPDATE public.businesses
      SET balance_due = balance_due + (v_delivery_fee + v_commission)
      WHERE id = new.business_id;

  ELSIF old.status = 'delivered' AND new.status <> 'delivered' THEN
    DELETE FROM public.business_charges
      WHERE order_id = new.id
        AND status = 'pending';

    v_delivery_fee := COALESCE(old.delivery_fee_charged, old.delivery_fee, 0);
    v_commission := COALESCE(old.commission_amount, COALESCE(old.tindivo_commission, 0) - v_delivery_fee, 0);

    UPDATE public.businesses
      SET balance_due = GREATEST(0, balance_due - (v_delivery_fee + v_commission))
      WHERE id = new.business_id;
  END IF;

  RETURN new;
END;
$$;

-- 7.2 handle_prepaid_refund_on_cancel
CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description
      ) VALUES (
        new.business_id, new.id, 'refund_charge', v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente'
      );

      UPDATE public.businesses
        SET balance_due = balance_due + v_amount
        WHERE id = new.business_id;

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

-- 7.3 resolve_fraud_claim
CREATE OR REPLACE FUNCTION public.resolve_fraud_claim(
  p_claim_id uuid, p_resolver uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS public.fraud_coverage_claims
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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

-- 7.4 register_appeal_refund
-- Igual que la de 0124 pero con el UPDATE manual devuelto. Se conserva el
-- predicado corregido y las dos guardias: revertir eso reintroduciría M-6.
CREATE OR REPLACE FUNCTION public.register_appeal_refund(
  p_report_id uuid, p_amount numeric, p_refund_proof_path text, p_admin_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_report public.reports;
  v_order public.orders;
  v_expected_amount numeric;
  v_caller uuid;
  v_admin_user_id uuid := p_admin_user_id;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
  END IF;

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

  IF v_report.type <> 'rejected_proof_disputed' THEN
    RAISE EXCEPTION 'El reporte no es una apelación' USING errcode = 'P0001';
  END IF;

  IF v_report.status = 'resolved' OR v_report.refund_status = 'completed' THEN
    RAISE EXCEPTION 'La devolución de este reporte ya fue completada' USING errcode = 'P0001';
  END IF;

  IF v_report.appeal_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Este reporte no está aprobado o ya fue reembolsado' USING errcode = 'P0001';
  END IF;

  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := v_caller;
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
  SET refund_status = 'completed', refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount, refund_completed_at = now(), updated_at = now()
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

REVOKE ALL ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  TO authenticated;


-- ── 8 · Verificación del rollback --------------------------------------------
-- SELECT to_regclass('public.settlements') IS NOT NULL AS tabla,
--        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--          WHERE n.nspname='public' AND p.proname IN
--            ('pay_settlement','generate_settlements','decrement_balance_on_payment')) = 3 AS funcs,
--        NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_business_charges_recalc_balance') AS sin_recalc;
