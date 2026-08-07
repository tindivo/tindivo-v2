-- =============================================================================
-- 0123 · Contingencia se va, y los appeals por fin llegan al ledger
-- =============================================================================
--
-- Spec: Docs/spec/spec-0123-eliminar-contingencia.md
-- Riesgos que cierra: Docs/RIESGOS-LEDGER.md — R-L4 completo, la mitad de R-L2,
-- R-L3 por obligación, y los menores M-1, M-2, M-4 y M-5.
--
-- DECISIÓN (Jesús, 2026-08-04): el fondo de contingencia se eliminó como
-- concepto de negocio y se maneja internamente. `business_charges` es la fuente
-- de verdad de la deuda.
--
-- POR QUÉ AHORA. Medido el 2026-08-04 contra prod: 0 filas en
-- contingency_advances, business_charges, settlements, restaurant_payments,
-- businesses y orders. No hay datos que migrar ni saldos que reconciliar. Con
-- el primer pedido del piloto esta ventana se cierra.
--
-- EL FONDO YA ESTABA MUERTO, PERO SUS LECTORES NO.
--   `0077:169-174` borró la clave `contingency_fund` de `app_settings` y no
--   tocó a las dos funciones que la leen. Desde entonces:
--     · `create_contingency_advance` descuenta del fondo con un UPDATE que
--       afecta 0 filas, en silencio.
--     · `dispute_contingency_advance` lee `disputeWindowHours` con un SELECT
--       INTO sobre cero filas, que deja la variable en NULL. La comparación
--       `created_at < now() - (NULL || ' hours')::interval` da NULL, el IF no se
--       toma, y la ventana de disputa NO SE APLICA NUNCA.
--   Nada de eso se arregla aquí: se borra entero.
--
-- LA CAUSA RAÍZ QUE ESTA MIGRACIÓN NO PUEDE REPETIR.
--   `CREATE OR REPLACE FUNCTION` con una firma distinta NO reemplaza: crea una
--   función nueva, con ACL por defecto. `0073` y `0077` intentaron mover
--   `register_appeal_refund` al ledger creando una sobrecarga de 4 argumentos;
--   la de 3 sobrevivió intacta y el endpoint nunca se repuntó, así que el
--   desacoplamiento que `0077` declara en su cabecera NUNCA OCURRIÓ.
--   Y como ninguna de las dos emitió grants, la de 4 quedó ejecutable por
--   `anon` (M-5).
--   Por eso aquí: DROP con firma explícita, y REVOKE + GRANT en el mismo
--   archivo. Ver la REGLA en Docs/RIESGOS-LEDGER.md.
--
-- =============================================================================


-- ── 1 · resolve_fraud_claim: deja de escribir en el ledger paralelo ---------
-- Se le quita SOLO el INSERT a contingency_advances. Conserva el asiento en
-- business_charges y el UPDATE a balance_due, que es donde el monto entra —
-- una sola vez, verificado: el INSERT era directo, no pasaba por
-- create_contingency_advance, así que no sumaba al saldo por segunda vez.
--
-- Lo que sí arregla quitarlo: esa fila quedaba con actor_charged='restaurante',
-- status='activo' y replenished_at NULL, que es el predicado exacto de la
-- reposición de pay_settlement. Una liquidación posterior habría descontado del
-- saldo el monto de un claim cuyo cargo sigue 'pending' en el ledger.
--
-- Firma sin cambios -> conserva su ACL sana (solo service_role).
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

      UPDATE public.businesses
        SET balance_due = balance_due + v_row.amount
        WHERE id = v_order.business_id;
    END IF;
  END IF;

  RETURN v_row;
END $$;


-- ── 2 · pay_settlement: se ACOTA, no se borra ------------------------------
-- Decisión: 0123 le quita el bloque de reposición del fondo y nada más. La
-- función sigue viva y su endpoint sigue respondiendo.
--
-- Ese bloque era EL SEGUNDO DECREMENTO de R-L2: bajaba balance_due una vez por
-- el pago (vía el trigger decrement_balance_on_payment) y otra por la
-- reposición. Es el mismo bug que `0076_fix_double_balance_decrement` corrigió
-- en settle_business_charges y que aquí nunca se revisó.
--
-- Se van con él: la variable v_repl y la clave `fundReplenished` del retorno
-- (verificado: no la consume nadie en apps/ ni packages/).
--
-- QUEDA PENDIENTE, y no entra aquí: que pay_settlement marque los cargos como
-- 'settled' (la otra mitad de R-L2). Antes de invertir en eso hace falta un
-- levantamiento sobre si el flujo de `settlements` sigue en uso — no tiene
-- pantalla en apps/admin, tiene 0 ejecuciones históricas, y el camino canónico
-- es settle_business_charges. Ver el spec, sección 6.
CREATE OR REPLACE FUNCTION public.pay_settlement(
  p_settlement_id uuid,
  p_paid_by uuid,
  p_method text DEFAULT 'yape'::text,
  p_note text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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


-- ── 3 · register_appeal_refund: la de 4 argumentos recupera sus guardias ----
-- Esta es la que escribe en business_charges y la que pasa a ser la única.
-- Se le portan las DOS protecciones que solo tenía la de 3 argumentos, con el
-- texto copiado literal — mensajes y errcode incluidos, porque
-- `refund/route.ts:60-63` mapea P0002 -> not_found y P0001 -> forbidden.
--
--   a) autenticación + rol admin
--   b) el monto debe ser EXACTAMENTE order_amount + delivery_fee del pedido
--
-- POR QUÉ (b) NO ES OPCIONAL: estos reembolsos son el precio completo del
-- pedido, decenas de soles, no S/3.50. Sin la validación, un tecleo le carga al
-- negocio lo que sea que se escribió. Portar el rol y no el monto sería
-- quedarse a medias.
--
-- La comprobación de autenticación se hace sobre auth.uid() y NO sobre
-- p_admin_user_id: si no, un llamador se la salta pasando cualquier uuid.
--
-- El predicado de elegibilidad se REESCRIBE, no se conserva de ninguna de las
-- dos. La de 4 comparaba contra el literal 'appeal', inexistente en el enum
-- report_type, y fallaba con 22P02 en toda llamada (M-6). Detalle en el
-- bloque de más abajo.
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
  -- (a) Autenticación y rol — portado de la sobrecarga de 3 argumentos
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

  -- CORREGIDO. La versión de 0073/0077 comparaba contra el literal 'appeal',
  -- que NO EXISTE en el enum report_type (no_show, rejected_proof_disputed,
  -- cash_difference, restaurant_fake, strike_reactivation, advance_dispute,
  -- prepay_refund_review). Postgres lanza 22P02 al castear, así que esa función
  -- fallaba en TODA llamada desde que se creó. Ver M-6 en RIESGOS-LEDGER.
  --
  -- Las apelaciones son reportes 'rejected_proof_disputed': así las filtra
  -- admin/appeals/route.ts:40. `prepay_refund_review` queda FUERA a propósito —
  -- hoy no tiene ningún camino a reembolso (solo etiqueta en labels.ts:54 y la
  -- pantalla de reportes, cuya única acción es resolver, no devolver). No se
  -- abre un camino de dinero que nadie pidió.
  IF v_report.type <> 'rejected_proof_disputed' THEN
    RAISE EXCEPTION 'El reporte no es una apelación' USING errcode = 'P0001';
  END IF;

  IF v_report.status = 'resolved' OR v_report.refund_status = 'completed' THEN
    RAISE EXCEPTION 'La devolución de este reporte ya fue completada' USING errcode = 'P0001';
  END IF;

  -- Portado de la sobrecarga de 3 argumentos: solo se devuelve lo aprobado.
  IF v_report.appeal_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Este reporte no está aprobado o ya fue reembolsado' USING errcode = 'P0001';
  END IF;

  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := v_caller;
  END IF;

  -- (b) Monto exacto — portado literal de la sobrecarga de 3 argumentos
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

  -- Actualizar el reporte a completado
  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  -- Registrar cargo por devolución en business_charges y actualizar balance_due
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

    UPDATE public.businesses
      SET balance_due = balance_due + p_amount
      WHERE id = v_report.business_id;
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

-- Grants en el MISMO archivo que la definición. Ver la REGLA en RIESGOS-LEDGER.
-- `authenticated` y NO `service_role`: current_user_has_role resuelve por
-- auth.uid(), así que sin JWT la comprobación de rol rechazaría todo. Mismo
-- patrón que 0067:480-481 para la sobrecarga de 3 argumentos. El guardián real
-- es la comprobación de rol DENTRO de la función, no el grant.
REVOKE ALL ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_appeal_refund(uuid, numeric, text, uuid)
  TO authenticated;


-- ── 4 · Fuera la sobrecarga vieja de appeals -------------------------------
-- La de 3 argumentos llama a create_contingency_advance: no puede sobrevivir al
-- borrado de la tabla. Va con firma explícita para no tocar a la de 4.
-- Con esto deja de existir la trampa de resolución por orden de argumentos:
-- `p_amount` y `p_refund_proof_path` están intercambiados entre ambas firmas.
DROP FUNCTION IF EXISTS public.register_appeal_refund(uuid, text, numeric);


-- ── 5 · Fuera las tres funciones de contingencia ---------------------------
-- Ninguna tiene endpoint ni trigger. La única invocación viva era la que acaba
-- de desaparecer en el paso 4.
DROP FUNCTION IF EXISTS public.create_contingency_advance(
  uuid, numeric, text, public.contingency_actor_charged, uuid, text);
DROP FUNCTION IF EXISTS public.dispute_contingency_advance(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.resolve_contingency_advance(uuid, uuid, numeric, text);


-- ── 6 · Fuera las dos funciones de trigger huérfanas ------------------------
-- Verificado: 0 triggers asociados y ninguna otra función las menciona.
--
-- `update_business_balance` es la más peligrosa de las dos: suma
-- tindivo_commission COMPLETO a balance_due, y tindivo_commission ya incluye el
-- envío. Es la versión pre-0074 de lo que hoy hace generate_delivery_charges.
-- Si alguien la vuelve a atar a un trigger sobre orders, cada entrega cuenta
-- doble. Se borra para que nadie pueda.
--
-- `handle_prepaid_cancel_auto_debt` es gemela de handle_prepaid_refund_on_cancel,
-- que sí está atada a trg_orders_prepaid_refund. Dos copias del mismo asiento,
-- una conectada.
DROP FUNCTION IF EXISTS public.update_business_balance();
DROP FUNCTION IF EXISTS public.handle_prepaid_cancel_auto_debt();


-- ── 7 · Fuera la tabla y sus tipos -----------------------------------------
-- La tabla no tiene NINGUNA FK entrante (verificado contra pg_constraint), así
-- que el DROP sale limpio. Se lleva consigo sus dos policies RLS
-- (ca_admin_all, ca_business_read) y el trigger touch_contingency_advances.
--
-- Los tipos van DESPUÉS de las funciones del paso 5: la firma de
-- create_contingency_advance los referencia. Y solo los usaban las columnas de
-- esta tabla (verificado contra information_schema.columns).
DROP TABLE IF EXISTS public.contingency_advances;

DROP TYPE IF EXISTS public.contingency_advance_status;
DROP TYPE IF EXISTS public.contingency_actor_charged;
