-- =============================================================================
-- scripts/test_0067.sql
-- Batería de Pruebas Transaccionales Aisladas para la Migración 0067
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_order_id uuid;
  v_customer_id uuid;
  v_admin_id uuid;
  v_other_user_id uuid;
  v_report_id uuid;
  v_expected_amount numeric;
  v_res jsonb;
  v_err_sqlstate text;
  v_err_message text;
  v_reports_count_before int;
  v_reports_count_after int;
  v_advances_count_before int;
  v_advances_count_after int;
BEGIN
  -- 1. Obtener pedido fixture existente en proof_rejected_final cancelado hace menos de 24h
  SELECT id, customer_user_id, (COALESCE(order_amount, 0) + COALESCE(delivery_fee, 0))
    INTO v_order_id, v_customer_id, v_expected_amount
  FROM public.orders
  WHERE status = 'cancelled' 
    AND cancel_reason = 'proof_rejected_final'
    AND cancelled_at IS NOT NULL
    AND cancelled_at > now() - interval '24 hours'
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'PRUEBA ABORTADA: No existe pedido fixture en status=cancelled y cancel_reason=proof_rejected_final (< 24h).' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_admin_id FROM public.users WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin') LIMIT 1;
  SELECT id INTO v_other_user_id FROM public.users WHERE id <> v_customer_id AND id IN (SELECT user_id FROM public.user_roles WHERE role = 'customer') LIMIT 1;

  RAISE NOTICE 'Fixture seleccionado -> Pedido: %, Cliente: %, Admin: %, Monto: S/ %', v_order_id, v_customer_id, v_admin_id, v_expected_amount;

  -- ---------------------------------------------------------------------------
  -- PRUEBA PRIVILEGIOS DE EJECUCIÓN (has_function_privilege)
  -- ---------------------------------------------------------------------------
  ASSERT has_function_privilege('anon', 'public.create_appeal_report(uuid, text)', 'execute') = false, 'PRIVILEGIO FALLO: anon puede ejecutar create_appeal_report';
  ASSERT has_function_privilege('authenticated', 'public.create_appeal_report(uuid, text)', 'execute') = true, 'PRIVILEGIO FALLO: authenticated debe ejecutar create_appeal_report';
  ASSERT has_function_privilege('anon', 'public.resolve_appeal(uuid, text, text)', 'execute') = false, 'PRIVILEGIO FALLO: anon puede ejecutar resolve_appeal';

  -- ---------------------------------------------------------------------------
  -- PRUEBA 1: Usuario No Autenticado
  -- ---------------------------------------------------------------------------
  EXECUTE 'RESET request.jwt.claims';
  BEGIN
    PERFORM public.create_appeal_report(v_order_id, 'Intento anónimo');
    RAISE EXCEPTION 'TEST FALLIDO: Se esperaba error de autenticación' USING errcode = 'P9999';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_sqlstate = RETURNED_SQLSTATE, v_err_message = MESSAGE_TEXT;
    IF v_err_sqlstate = 'P9999' THEN RAISE EXCEPTION '%', v_err_message; END IF;
    ASSERT v_err_sqlstate = 'P0001' AND v_err_message LIKE '%Usuario no autenticado%', 'TEST 1 FALLIDO: Mensaje o SQLSTATE inesperado';
    RAISE NOTICE 'Test 1 Aprobado: Rechazo a usuario no autenticado (SQLSTATE: %)', v_err_sqlstate;
  END;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 2: Usuario Ajeno (No dueño del pedido)
  -- ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', v_other_user_id, 'role', 'authenticated'));
  BEGIN
    PERFORM public.create_appeal_report(v_order_id, 'Intento ajeno');
    RAISE EXCEPTION 'TEST FALLIDO: Se esperaba error de autorización' USING errcode = 'P9999';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_sqlstate = RETURNED_SQLSTATE, v_err_message = MESSAGE_TEXT;
    IF v_err_sqlstate = 'P9999' THEN RAISE EXCEPTION '%', v_err_message; END IF;
    ASSERT v_err_sqlstate = 'P0001' AND v_err_message LIKE '%No autorizado%', 'TEST 2 FALLIDO: Mensaje inesperado';
    RAISE NOTICE 'Test 2 Aprobado: Rechazo a usuario ajeno (SQLSTATE: %)', v_err_sqlstate;
  END;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 3: Apelación Válida por Cliente Dueño con auth.uid()
  -- ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', v_customer_id, 'role', 'authenticated'));
  v_res := public.create_appeal_report(v_order_id, 'Apelación válida transaccional');
  ASSERT (v_res->>'ok')::boolean = true, 'TEST 3 FALLIDO: Apelación válida rechazada';
  SELECT id INTO v_report_id FROM public.reports WHERE order_id = v_order_id AND type = 'rejected_proof_disputed';
  RAISE NOTICE 'Test 3 Aprobado: Apelación creada correctamente (reportId: %)', v_report_id;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 4: Idempotencia en Llamada Duplicada
  -- ---------------------------------------------------------------------------
  v_res := public.create_appeal_report(v_order_id, 'Intento duplicado');
  ASSERT (v_res->>'alreadyExisted')::boolean = true, 'TEST 4 FALLIDO: Idempotencia no detectó duplicado';
  RAISE NOTICE 'Test 4 Aprobado: Idempotencia confirmada';

  -- ---------------------------------------------------------------------------
  -- PRUEBA 5: Intento de Resolución Admin por Cliente (Debe fallar)
  -- ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.resolve_appeal(v_report_id, 'favor_cliente');
    RAISE EXCEPTION 'TEST FALLIDO: Permitió resolución a usuario sin rol admin' USING errcode = 'P9999';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_sqlstate = RETURNED_SQLSTATE, v_err_message = MESSAGE_TEXT;
    IF v_err_sqlstate = 'P9999' THEN RAISE EXCEPTION '%', v_err_message; END IF;
    ASSERT v_err_sqlstate = '42501', 'TEST 5 FALLIDO: SQLSTATE debe ser 42501 (Forbidden)';
    RAISE NOTICE 'Test 5 Aprobado: Rechazo a cliente sin rol admin (SQLSTATE: %)', v_err_sqlstate;
  END;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 6: Transición in_review y Resolución A Favor del Cliente como Admin
  -- ---------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', v_admin_id, 'role', 'authenticated'));
  PERFORM public.mark_appeal_in_review(v_report_id);
  v_res := public.resolve_appeal(v_report_id, 'favor_cliente', 'Aprobado tras verificar Yape');
  ASSERT (v_res->>'resolution') = 'favor_cliente', 'TEST 6 FALLIDO: Resolución falló';
  RAISE NOTICE 'Test 6 Aprobado: Resuelto a favor del cliente como Admin';

  -- ---------------------------------------------------------------------------
  -- PRUEBA 7: Registro de Devolución con Monto Erróneo (Debe fallar)
  -- ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.register_appeal_refund(v_report_id, 'proofs/refund_test.png', v_expected_amount + 5.00);
    RAISE EXCEPTION 'TEST FALLIDO: Permitió monto no coincidente' USING errcode = 'P9999';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_sqlstate = RETURNED_SQLSTATE, v_err_message = MESSAGE_TEXT;
    IF v_err_sqlstate = 'P9999' THEN RAISE EXCEPTION '%', v_err_message; END IF;
    ASSERT v_err_sqlstate = 'P0001' AND v_err_message LIKE '%monto expresado%', 'TEST 7 FALLIDO: Mensaje inesperado';
    RAISE NOTICE 'Test 7 Aprobado: Rechazó monto erróneo (SQLSTATE: %)', v_err_sqlstate;
  END;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 8: Registro de Devolución Exitoso con Monto Exacto
  -- ---------------------------------------------------------------------------
  v_res := public.register_appeal_refund(v_report_id, 'proofs/refund_test.png', v_expected_amount);
  ASSERT (v_res->>'refundCompleted')::boolean = true, 'TEST 8 FALLIDO: Devolución válida rechazada';
  RAISE NOTICE 'Test 8 Aprobado: Devolución registrada correctamente (S/ %)', v_expected_amount;

  -- ---------------------------------------------------------------------------
  -- PRUEBA 9: Verificación de Re-ejecución del Trigger (UPDATE OF status)
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO v_reports_count_before FROM public.reports;
  SELECT count(*) INTO v_advances_count_before FROM public.contingency_advances;

  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order_id;

  SELECT count(*) INTO v_reports_count_after FROM public.reports;
  SELECT count(*) INTO v_advances_count_after FROM public.contingency_advances;

  ASSERT v_reports_count_before = v_reports_count_after, 'TEST 9 FALLIDO: Trigger generó reporte en update repetido';
  ASSERT v_advances_count_before = v_advances_count_after, 'TEST 9 FALLIDO: Trigger generó adelanto en update repetido';
  RAISE NOTICE 'Test 9 Aprobado: Trigger no re-ejecutó efectos secundarios en updates repetidos';

END $$;

ROLLBACK;
