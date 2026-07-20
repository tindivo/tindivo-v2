-- =============================================================================
-- scripts/test_0068.sql
-- Suite de Pruebas de Integración y Seguridad para la Migración 0068 (Outbox & Fallback)
-- Encapsulado dentro de una transacción aislada (BEGIN ... ROLLBACK)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  -- IDs de fixtures
  v_owner_id    uuid := gen_random_uuid();
  v_customer_id uuid := gen_random_uuid();
  v_business_id uuid := gen_random_uuid();

  -- Pedidos con escenarios diferenciados:
  -- (A) reciente:       cancelado hace  2h → ventana activa   → fallback omite (appeal_window_still_active)
  -- (B) appealed:       cancelado hace  4h → ventana activa   → cliente apela, fallback omite (appeal_window_still_active)
  -- (C) appealed_old:   cancelado hace 26h → ventana expirada → cliente apeló antes, fallback omite (customer_appealed)
  -- (D) due:            cancelado hace 26h → ventana expirada → sin apelación → fallback crea reporte (idempotente)
  v_order_id_recent       uuid := gen_random_uuid();
  v_order_id_appealed     uuid := gen_random_uuid();
  v_order_id_appealed_old uuid := gen_random_uuid();
  v_order_id_due          uuid := gen_random_uuid();

  -- Auxiliares
  v_res                     jsonb;
  v_outbox_count_recent     int;
  v_outbox_count_appealed   int;
  v_outbox_count_app_old    int;
  v_outbox_count_due        int;
  v_outbox_appeal_count     int;
  v_report_count            int;
BEGIN
  RAISE NOTICE '=== INICIANDO PRUEBAS DE INTEGRACIÓN MIGRACIÓN 0068 ===';

  -- ===========================
  -- 0. SETUP DE FIXTURES
  -- ===========================

  INSERT INTO public.users (id, email, primary_role) VALUES
    (v_owner_id,    'owner_test_0068@test.internal',    'business'),
    (v_customer_id, 'customer_test_0068@test.internal', 'customer');

  INSERT INTO public.businesses (id, user_id, name, publishes_catalog, accepts_web_pickup)
  VALUES (v_business_id, v_owner_id, 'Test Business 0068', true, true);

  RAISE NOTICE '[OK] Fixtures de usuario y negocio creados.';

  -- ===========================
  -- 1. VERIFICACIÓN DE PERMISOS DE SEGURIDAD RLS
  -- ===========================
  ASSERT has_table_privilege('anon', 'public.outbox_events', 'select') = false,
    'PRIVILEGIO FALLO: anon no debe consultar outbox_events';
  ASSERT has_table_privilege('authenticated', 'public.outbox_events', 'select') = false,
    'PRIVILEGIO FALLO: authenticated no debe consultar outbox_events';
  ASSERT has_function_privilege('anon', 'public.create_fallback_appeal_review(uuid)', 'execute') = false,
    'PRIVILEGIO FALLO: anon no debe ejecutar create_fallback_appeal_review';
  ASSERT has_function_privilege('authenticated', 'public.create_fallback_appeal_review(uuid)', 'execute') = false,
    'PRIVILEGIO FALLO: authenticated no debe ejecutar create_fallback_appeal_review';
  ASSERT has_function_privilege('service_role', 'public.create_fallback_appeal_review(uuid)', 'execute') = true,
    'PRIVILEGIO FALLO: service_role debe ejecutar create_fallback_appeal_review';

  RAISE NOTICE '[OK] Permisos de seguridad y RLS confirmados.';

  -- ===========================
  -- 2. FIXTURES DE PEDIDOS (INSERT en validando → UPDATE a cancelled dispara trigger)
  -- ===========================

  -- (A) Reciente: ventana activa, sin apelación
  INSERT INTO public.orders (id, short_id, business_id, customer_user_id, status, payment_intent, order_amount, delivery_fee)
  VALUES (v_order_id_recent, 'REC22222', v_business_id, v_customer_id, 'validando', 'prepaid', 40.00, 5.00);
  UPDATE public.orders SET status = 'cancelled', cancel_reason = 'proof_rejected_final',
    cancelled_at = now() - interval '2 hours' WHERE id = v_order_id_recent;

  -- (B) Appealed: ventana activa (4h), el cliente va a apelar en sección 5
  INSERT INTO public.orders (id, short_id, business_id, customer_user_id, status, payment_intent, order_amount, delivery_fee)
  VALUES (v_order_id_appealed, 'APP22222', v_business_id, v_customer_id, 'validando', 'prepaid', 60.00, 5.00);
  UPDATE public.orders SET status = 'cancelled', cancel_reason = 'proof_rejected_final',
    cancelled_at = now() - interval '4 hours' WHERE id = v_order_id_appealed;

  -- (C) Appealed-old: ventana expirada (26h), se inyectará la apelación directamente para simular que el cliente apeló a tiempo
  INSERT INTO public.orders (id, short_id, business_id, customer_user_id, status, payment_intent, order_amount, delivery_fee)
  VALUES (v_order_id_appealed_old, 'APV22222', v_business_id, v_customer_id, 'validando', 'prepaid', 55.00, 5.00);
  UPDATE public.orders SET status = 'cancelled', cancel_reason = 'proof_rejected_final',
    cancelled_at = now() - interval '26 hours' WHERE id = v_order_id_appealed_old;

  -- (D) Due: ventana expirada (26h), sin ninguna apelación → fallback debe crear reporte
  INSERT INTO public.orders (id, short_id, business_id, customer_user_id, status, payment_intent, order_amount, delivery_fee)
  VALUES (v_order_id_due, 'DUE22222', v_business_id, v_customer_id, 'validando', 'prepaid', 50.00, 5.00);
  UPDATE public.orders SET status = 'cancelled', cancel_reason = 'proof_rejected_final',
    cancelled_at = now() - interval '26 hours' WHERE id = v_order_id_due;

  RAISE NOTICE '[OK] Fixtures de pedidos creados (INSERT+UPDATE para disparar trigger).';

  -- ===========================
  -- 3. VERIFICACIÓN DE OUTBOX TRIGGER — 1 evento por pedido
  -- ===========================
  SELECT COUNT(*) INTO v_outbox_count_recent FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final' AND payload->>'orderId' = v_order_id_recent::text;

  SELECT COUNT(*) INTO v_outbox_count_appealed FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final' AND payload->>'orderId' = v_order_id_appealed::text;

  SELECT COUNT(*) INTO v_outbox_count_app_old FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final' AND payload->>'orderId' = v_order_id_appealed_old::text;

  SELECT COUNT(*) INTO v_outbox_count_due FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final' AND payload->>'orderId' = v_order_id_due::text;

  ASSERT v_outbox_count_recent = 1,   'OUTBOX: pedido A (reciente) debe tener 1 evento';
  ASSERT v_outbox_count_appealed = 1, 'OUTBOX: pedido B (appealed) debe tener 1 evento';
  ASSERT v_outbox_count_app_old = 1,  'OUTBOX: pedido C (appealed_old) debe tener 1 evento';
  ASSERT v_outbox_count_due = 1,      'OUTBOX: pedido D (due) debe tener 1 evento';

  RAISE NOTICE '[OK] Transactional Outbox Trigger: Exactamente 1 evento por cancelación.';

  -- ===========================
  -- 4. FALLBACK PEDIDO A — ventana activa → omite (appeal_window_still_active)
  -- ===========================
  v_res := public.create_fallback_appeal_review(v_order_id_recent);
  ASSERT (v_res->>'skipped')::boolean = true, 'FALLBACK A FALLÓ: Debe omitirse dentro de 24h';
  ASSERT (v_res->>'reason') = 'appeal_window_still_active', 'REASON A FALLÓ: Debe ser appeal_window_still_active';

  RAISE NOTICE '[OK] Fallback dentro de ventana omitido (appeal_window_still_active).';

  -- ===========================
  -- 5. APELACIÓN CLIENTE — Pedido B (ventana activa) + Outbox atómico
  -- ===========================
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_customer_id::text, 'role', 'authenticated')::text,
    true
  );

  v_res := public.create_appeal_report(v_order_id_appealed, 'Apelación de prueba transaccional');
  ASSERT (v_res->>'alreadyExisted')::boolean = false, 'APELACIÓN B FALLÓ: Debe crear reporte';

  SELECT COUNT(*) INTO v_outbox_appeal_count FROM public.outbox_events
  WHERE event_type = 'order/appeal.created' AND payload->>'orderId' = v_order_id_appealed::text;

  ASSERT v_outbox_appeal_count = 1, 'OUTBOX APELACIÓN B FALLÓ: Debe haber 1 evento order/appeal.created';

  RAISE NOTICE '[OK] Apelación B creada y outbox order/appeal.created encolado atómicamente.';

  -- ===========================
  -- 6. FALLBACK PEDIDO C — ventana expirada + apelación preexistente → customer_appealed
  --    (se inyecta la apelación directamente sin pasar por RPC para evitar validación de ventana)
  -- ===========================
  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id, description, created_by, appeal_status, appeal_deadline
  ) VALUES (
    'rejected_proof_disputed', 'open', v_order_id_appealed_old, v_business_id, v_customer_id,
    'Apelación inyectada para fixture de prueba', v_customer_id, 'pending',
    now() - interval '2 hours'  -- deadline ya expirado (apeló a tiempo, deadline pasó)
  );

  v_res := public.create_fallback_appeal_review(v_order_id_appealed_old);
  ASSERT (v_res->>'skipped')::boolean = true, 'FALLBACK C FALLÓ: Debe omitirse (cliente ya apeló)';
  ASSERT (v_res->>'reason') = 'customer_appealed', 'REASON C FALLÓ: Debe ser customer_appealed';

  RAISE NOTICE '[OK] Fallback C omitido por apelación preexistente del cliente (customer_appealed).';

  -- ===========================
  -- 7. FALLBACK PEDIDO D — ventana expirada, sin apelación → crea reporte (idempotente)
  -- ===========================
  v_res := public.create_fallback_appeal_review(v_order_id_due);
  ASSERT (v_res->>'skipped')::boolean = false, 'FALLBACK D FALLÓ: Debe crear reporte';
  ASSERT (v_res->>'reportId') IS NOT NULL, 'FALLBACK D FALLÓ: Debe retornar reportId';

  -- Segunda llamada: idempotencia
  v_res := public.create_fallback_appeal_review(v_order_id_due);
  ASSERT (v_res->>'skipped')::boolean = true, 'IDEMPOTENCIA D FALLÓ: Segunda llamada debe ser skipped';
  ASSERT (v_res->>'reason') = 'fallback_already_exists', 'REASON D FALLÓ: Debe ser fallback_already_exists';

  SELECT COUNT(*) INTO v_report_count FROM public.reports
  WHERE order_id = v_order_id_due AND type = 'prepay_refund_review' AND created_by IS NULL;

  ASSERT v_report_count = 1, 'UNICIDAD D FALLÓ: Debe existir exactamente 1 reporte prepay_refund_review';

  RAISE NOTICE '[OK] Fallback D creado de forma atómica e idempotente.';

  RAISE NOTICE '=== TODAS LAS PRUEBAS DE LA MIGRACIÓN 0068 PASARON SATISFACTORIAMENTE ===';
END $$;

ROLLBACK;
