-- =============================================================================
-- 0124 · `balance_due` pasa a derivarse del ledger, y settlements desaparece
-- =============================================================================
--
-- Spec: Docs/spec/spec-fase-2-ledger-y-sprint.md, PARTE B — con el alcance
-- CORREGIDO tras dos rondas de levantamiento. Lo que el spec pedía en B.4 y B.5
-- (completar `pay_settlement`, corregir `generate_settlements`) ya no aplica:
-- ese módulo se borra entero.
--
-- Cierra R-L1 y la mitad restante de R-L2 (Docs/RIESGOS-LEDGER.md).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ EL TRIGGER DE B.2 NO BASTA POR SÍ SOLO — MEDIDO, NO DEDUCIDO
--
--   Creando SOLO el trigger que describe el spec y entregando un pedido real en
--   una transacción revertida, el resultado fue:
--
--       suma_ledger | balance_due
--       ------------+-------------
--              3.50 |        7.00
--
--   El doble exacto. La causa es el orden dentro de `generate_delivery_charges`:
--   inserta los cargos (cada INSERT dispara el recálculo, que deja
--   balance_due = SUM) y DESPUÉS suma el mismo monto a mano. B.1 nombraba dos
--   funciones que escriben `balance_due`; el `grep` sobre `pg_proc` devuelve
--   SEIS, y cuatro de ellas hacen el par "INSERT del cargo + UPDATE del saldo".
--
--   Por eso esta migración no se limita a crear el trigger: le quita el UPDATE
--   manual a esas cuatro. Sin ese paso, cada entrega cobraría el doble.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ SE BORRA SETTLEMENTS EN VEZ DE ARREGLARLO — CERO USO VERIFICADO
--
--   · `settlements`: 0 filas en prod.
--   · `restaurant_payments` con `settlement_id` no nulo: 0. Es el único campo
--     que distingue un pago hecho por `pay_settlement` de uno hecho por
--     `settle_business_charges`, así que 0 significa que ese camino nunca corrió.
--   · `pay_settlement` no emite `domain_events` ni `order_event_log`, así que la
--     ausencia de eventos NO era prueba por sí sola. El dato que discrimina es
--     el anterior.
--   · Ninguna pantalla de `apps/admin` invoca `pay_settlement` ni el POST de
--     `generate_settlements`. Buscado por nombre de RPC, por ruta y contra el
--     listado completo de pantallas.
--
--   `settle_business_charges` es el camino canónico y el único con UI.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE
--
--   No toca los CHECK de `business_charges` (`amount > 0`, y `charge_type`
--   limitado a commission/delivery_fee/refund_charge). Por eso el saldo puede
--   quedar negativo por diferencia entre cargos, pero todavía NO se puede
--   registrar un cargo negativo de tipo `adjustment`: el caso 4 de la prueba de
--   predicados del spec (B.7) queda diferido, tal como se acordó.
--
--   No toca `commissions` ni `advance_order` — eso es la Parte C.
--
-- =============================================================================


-- ── 1 · El saldo se deriva del ledger ---------------------------------------
-- Recálculo COMPLETO, no incremental. Es lo que lo hace reconstruible de verdad
-- y auto-reparable: cualquier desajuste se corrige en la siguiente escritura.
--
-- SIN `greatest(0, ...)`: el saldo puede quedar negativo. El tope pertenece a la
-- capa de cobro, no al asiento.
CREATE OR REPLACE FUNCTION public.recalc_business_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_business_id uuid := COALESCE(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE public.businesses b
     SET balance_due = COALESCE((
           SELECT SUM(bc.amount)
             FROM public.business_charges bc
            WHERE bc.business_id = v_business_id
              AND bc.status = 'pending'
         ), 0)
   WHERE b.id = v_business_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_charges_recalc_balance ON public.business_charges;
CREATE TRIGGER trg_business_charges_recalc_balance
AFTER INSERT OR UPDATE OR DELETE ON public.business_charges
FOR EACH ROW EXECUTE FUNCTION public.recalc_business_balance();


-- ── 2 · generate_delivery_charges: se le quitan DOS UPDATE -------------------
-- Removido de la rama normal (líneas 42-44 del cuerpo previo):
--     -- Actualizar balance_due con la suma de ambos
--     UPDATE public.businesses
--       SET balance_due = balance_due + (v_delivery_fee + v_commission)
--       WHERE id = new.business_id;
--
-- Removido de la rama de reversión (líneas 56-57):
--     UPDATE public.businesses
--       SET balance_due = GREATEST(0, balance_due - (v_delivery_fee + v_commission))
--       WHERE id = new.business_id;
--
-- La segunda es inalcanzable por el invariante 8 de CLAUDE.md (`delivered` es
-- terminal), pero se quita igual: con el saldo derivado sería código muerto que
-- además miente sobre cómo se mantiene el balance.
CREATE OR REPLACE FUNCTION public.generate_delivery_charges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_commission numeric;
  v_delivery_fee numeric;
  v_short_id text;
BEGIN
  -- Solo actuar cuando el status cambia A delivered
  IF old.status <> 'delivered' AND new.status = 'delivered' THEN
    v_short_id := new.short_id;

    -- Usar las columnas desglosadas con fallbacks retrocompatibles
    v_delivery_fee := COALESCE(new.delivery_fee_charged, new.delivery_fee, 0);
    v_commission := COALESCE(new.commission_amount, COALESCE(new.tindivo_commission, 0) - v_delivery_fee, 0);

    IF (v_delivery_fee + v_commission) <= 0 THEN
      RETURN new;
    END IF;

    -- Cargo por delivery fee
    IF v_delivery_fee > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'delivery_fee', v_delivery_fee,
         'Delivery fee pedido #' || v_short_id);
    END IF;

    -- Cargo por comisión Tindivo
    IF v_commission > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'commission', v_commission,
         'Comisión pedido #' || v_short_id);
    END IF;

    -- `balance_due` lo mantiene ahora trg_business_charges_recalc_balance.

  -- Si sale de delivered, revertir
  ELSIF old.status = 'delivered' AND new.status <> 'delivered' THEN
    DELETE FROM public.business_charges
      WHERE order_id = new.id
        AND status = 'pending';
    -- El DELETE dispara el recálculo. Ya no hace falta tocar balance_due, y con
    -- ello desaparece el defecto latente documentado en el invariante 8: aquel
    -- UPDATE restaba el monto COMPLETO aunque los cargos ya estuvieran
    -- liquidados.
  END IF;

  RETURN new;
END;
$$;


-- ── 3 · handle_prepaid_refund_on_cancel: se le quita el UPDATE ---------------
-- Removido (líneas 38-40 del cuerpo previo):
--     -- 2. Actualizar balance_due del negocio
--     UPDATE public.businesses
--       SET balance_due = balance_due + v_amount
--       WHERE id = new.business_id;
CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_amount numeric;
  v_reason text;
BEGIN
  IF new.payment_intent <> 'prepaid' THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.order_amount, 0) + COALESCE(new.delivery_fee, 0);
  v_reason := COALESCE(new.cancel_reason::text, '');

  -- El no-show o comprobante rechazado final no generan devolución automática al restaurante
  IF v_reason = 'no_show' OR v_reason = 'proof_rejected_final' THEN
    RETURN new;
  END IF;

  IF new.payment_proof_status = 'verified'
     AND v_amount > 0
     AND v_reason IN ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') THEN
    BEGIN
      -- Insertar cargo por devolución en business_charges (Ledger).
      -- `balance_due` lo mantiene ahora el trigger de recálculo.
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description
      ) VALUES (
        new.business_id,
        new.id,
        'refund_charge',
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente'
      );

    EXCEPTION WHEN OTHERS THEN
      -- En caso de fallo inesperado, derivar a la bandeja de reportes de admin
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


-- ── 4 · resolve_fraud_claim: se le quita el UPDATE ---------------------------
-- Removido (líneas 36-37 del cuerpo previo):
--     UPDATE public.businesses
--       SET balance_due = balance_due + v_row.amount
--       WHERE id = v_order.business_id;
-- Firma sin cambios -> conserva su ACL (solo service_role).
CREATE OR REPLACE FUNCTION public.resolve_fraud_claim(
  p_claim_id uuid,
  p_resolver uuid,
  p_approve boolean,
  p_note text DEFAULT NULL::text
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
        v_order.business_id,
        v_row.order_id,
        'refund_charge',
        v_row.amount,
        'Devolución por cobertura de fraude — ' || v_row.reason,
        'pending'
      );
      -- `balance_due` lo mantiene ahora el trigger de recálculo.
    END IF;
  END IF;

  RETURN v_row;
END $$;


-- ── 5 · register_appeal_refund: se le quita el UPDATE ------------------------
-- Removido (líneas 101-102 del cuerpo previo):
--     UPDATE public.businesses
--       SET balance_due = balance_due + p_amount
--       WHERE id = v_report.business_id;
-- Firma sin cambios. Los grants se re-emiten igual: es función de dinero y la
-- REGLA de Docs/RIESGOS-LEDGER.md lo pide sin excepción.
CREATE OR REPLACE FUNCTION public.register_appeal_refund(
  p_report_id uuid,
  p_amount numeric,
  p_refund_proof_path text,
  p_admin_user_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
      v_report.business_id,
      v_report.order_id,
      p_report_id,
      'refund_charge',
      p_amount,
      'Devolución por apelación aprobada — comprobante rechazado erróneamente'
    );
    -- `balance_due` lo mantiene ahora el trigger de recálculo.
  END IF;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.refund_registered', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id, 'amount', p_amount, 'proofPath', p_refund_proof_path));

  RETURN jsonb_build_object(
    'ok', true,
    'reportId', p_report_id,
    'refundAmount', p_amount,
    'refundStatus', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  TO authenticated;


-- ── 6 · Fuera decrement_balance_on_payment -----------------------------------
-- No se adapta, se borra. Con el saldo derivado, marcar los cargos como
-- `settled` ya dispara el recálculo; si además el trigger restara el pago, se
-- descontaría dos veces.
--
-- El desbloqueo por mora que hacía este trigger NO se pierde: sobrevive en
-- `settle_business_charges` (verificado en su cuerpo vivo, líneas 64-70):
--
--     UPDATE public.businesses
--       SET is_blocked = false, blocked_for_debt = false, block_reason = NULL
--       WHERE id = p_business_id AND blocked_for_debt = true AND balance_due <= 0;
--
-- y corre DESPUÉS de marcar los cargos, así que el recálculo ya ocurrió cuando
-- se evalúa la condición.
DROP TRIGGER IF EXISTS trg_restaurant_payments_decrement_balance ON public.restaurant_payments;
DROP FUNCTION IF EXISTS public.decrement_balance_on_payment();


-- ── 7 · Fuera el módulo de settlements ---------------------------------------
DROP FUNCTION IF EXISTS public.pay_settlement(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.generate_settlements(date, date, date, uuid);

-- Las dos columnas que apuntaban a `settlements`. Ambas con FK e índice; ambas
-- con 0 filas no nulas. Sin la tabla serían uuid huérfanos sin referente.
ALTER TABLE public.business_charges DROP COLUMN IF EXISTS settlement_id;
ALTER TABLE public.restaurant_payments DROP COLUMN IF EXISTS settlement_id;

DROP TABLE IF EXISTS public.settlements;


-- ── 8 · Backfill: alinear el saldo existente con el ledger -------------------
-- El trigger solo actúa sobre escrituras futuras. Sin esto, cualquier fila de
-- `businesses` conserva el valor que tuviera y la reconciliación global no daría
-- cero. En prod hay 0 negocios y 0 cargos, así que no cambia nada; en local, con
-- el seed E2E, sí.
UPDATE public.businesses b
   SET balance_due = COALESCE((
         SELECT SUM(bc.amount)
           FROM public.business_charges bc
          WHERE bc.business_id = b.id
            AND bc.status = 'pending'
       ), 0)
 WHERE b.balance_due IS DISTINCT FROM COALESCE((
         SELECT SUM(bc.amount)
           FROM public.business_charges bc
          WHERE bc.business_id = b.id
            AND bc.status = 'pending'
       ), 0);
