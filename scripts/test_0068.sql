-- =============================================================================
-- scripts/test_0068.sql
-- Suite de Pruebas de Integración y Seguridad para la Migración 0068 (Outbox & Fallback)
-- Encapsulado dentro de una transacción aislada (BEGIN ... ROLLBACK)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  -- IDs de fixtures
  v_owner_id     uuid := gen_random_uuid();   -- usuario dueño del negocio
  v_customer_id  uuid := gen_random_uuid();   -- usuario cliente
  v_business_id  uuid := gen_random_uuid();   -- negocio

  -- IDs de pedidos
  v_order_id_recent   uuid := gen_random_uuid();
  v_order_id_due      uuid := gen_random_uuid();
  v_order_id_appealed uuid := gen_random_uuid();

  -- Auxiliares
  v_res                 jsonb;
  v_outbox_count_recent int;
  v_outbox_count_due    int;
  v_outbox_count_appealed int;
  v_outbox_appeal_count int;
  v_report_count        int;
BEGIN
  RAISE NOTICE '=== INICIANDO PRUEBAS DE INTEGRACIÓN MIGRACIÓN 0068 ===';

  -- ===========================
  -- 0. SETUP DE FIXTURES
  -- ===========================

  -- Insertar usuarios en public.users (sin pasar por auth.users porque estamos en service_role)
  INSERT INTO public.users (id, email, primary_role)
  VALUES
    (v_owner_id,    'owner_test_0068@test.internal', 'business'),
    (v_customer_id, 'customer_test_0068@test.internal', 'customer');

  -- Insertar negocio
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
  -- 2. CREACIÓN DE FIXTURES DE PEDIDOS CANCELADOS
  -- El trigger trg_orders_outbox_events dispara en AFTER UPDATE OF status,
  -- por lo que se inserta primero en 'pending' y luego se actualiza a 'cancelled'.
  -- ===========================

  -- Pedido 1: Cancelado reciente (dentro de las 24h)
  INSERT INTO public.orders (
    id, short_id, business_id, customer_user_id, status, payment_intent,
    order_amount, delivery_fee
  ) VALUES (
    v_order_id_recent, 'REC22222', v_business_id, v_customer_id,
    'validando', 'prepaid', 40.00, 5.00
  );
  UPDATE public.orders
  SET status = 'cancelled',
      cancel_reason = 'proof_rejected_final',
      cancelled_at  = now() - interval '2 hours'
  WHERE id = v_order_id_recent;

  -- Pedido 2: Cancelado hace más de 24h sin apelación
  INSERT INTO public.orders (
    id, short_id, business_id, customer_user_id, status, payment_intent,
    order_amount, delivery_fee
  ) VALUES (
    v_order_id_due, 'DUE22222', v_business_id, v_customer_id,
    'validando', 'prepaid', 50.00, 5.00
  );
  UPDATE public.orders
  SET status = 'cancelled',
      cancel_reason = 'proof_rejected_final',
      cancelled_at  = now() - interval '26 hours'
  WHERE id = v_order_id_due;

  -- Pedido 3: Cancelado hace más de 24h — para probar apelación de cliente
  INSERT INTO public.orders (
    id, short_id, business_id, customer_user_id, status, payment_intent,
    order_amount, delivery_fee
  ) VALUES (
    v_order_id_appealed, 'APP22222', v_business_id, v_customer_id,
    'validando', 'prepaid', 60.00, 5.00
  );
  UPDATE public.orders
  SET status = 'cancelled',
      cancel_reason = 'proof_rejected_final',
      cancelled_at  = now() - interval '26 hours'
  WHERE id = v_order_id_appealed;

  RAISE NOTICE '[OK] Fixtures de pedidos cancelados creados (via INSERT+UPDATE para disparar trigger).';

  -- ===========================
  -- 3. VERIFICACIÓN DE UNICIDAD Y ATOMICIDAD DEL OUTBOX POR PEDIDO
  -- ===========================
  SELECT COUNT(*) INTO v_outbox_count_recent
  FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final'
    AND payload->>'orderId' = v_order_id_recent::text;

  SELECT COUNT(*) INTO v_outbox_count_due
  FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final'
    AND payload->>'orderId' = v_order_id_due::text;

  SELECT COUNT(*) INTO v_outbox_count_appealed
  FROM public.outbox_events
  WHERE event_type = 'order/proof-rejected-final'
    AND payload->>'orderId' = v_order_id_appealed::text;

  ASSERT v_outbox_count_recent = 1,
    'OUTBOX TRIGGER FALLÓ: El pedido reciente debe generar exactamente 1 evento outbox';
  ASSERT v_outbox_count_due = 1,
    'OUTBOX TRIGGER FALLÓ: El pedido vencido debe generar exactamente 1 evento outbox';
  ASSERT v_outbox_count_appealed = 1,
    'OUTBOX TRIGGER FALLÓ: El pedido a apelar debe generar exactamente 1 evento outbox';

  RAISE NOTICE '[OK] Transactional Outbox Trigger: Exactamente 1 evento por cancelación proof_rejected_final.';

  -- ===========================
  -- 4. FALLBACK DENTRO DE LAS 24H (debe omitirse)
  -- ===========================
  v_res := public.create_fallback_appeal_review(v_order_id_recent);
  ASSERT (v_res->>'skipped')::boolean = true,
    'FALLBACK FALLÓ: Debe omitirse pedido dentro de 24h';
  ASSERT (v_res->>'reason') = 'appeal_window_still_active',
    'REASON FALLÓ: Razón debe ser appeal_window_still_active';

  RAISE NOTICE '[OK] Fallback dentro de ventana de 24h omitido correctamente.';

  -- ===========================
  -- 5. APELACIÓN DEL CLIENTE Y OUTBOX ATÓMICO
  -- ===========================
  -- Simular sesión autenticada del cliente
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_customer_id::text, 'role', 'authenticated')::text,
    true
  );

  v_res := public.create_appeal_report(v_order_id_appealed, 'Apelación de prueba transaccional');
  ASSERT (v_res->>'alreadyExisted')::boolean = false,
    'APELACIÓN FALLÓ: Debe crear reporte de apelación';

  SELECT COUNT(*) INTO v_outbox_appeal_count
  FROM public.outbox_events
  WHERE event_type = 'order/appeal.created'
    AND payload->>'orderId' = v_order_id_appealed::text;

  ASSERT v_outbox_appeal_count = 1,
    'OUTBOX APELACIÓN FALLÓ: Debe generar exactamente 1 evento order/appeal.created';

  RAISE NOTICE '[OK] Apelación creada y evento order/appeal.created encolado en outbox atómicamente.';

  -- Fallback sobre pedido apelado (debe omitirse)
  v_res := public.create_fallback_appeal_review(v_order_id_appealed);
  ASSERT (v_res->>'skipped')::boolean = true,
    'FALLBACK FALLÓ: Debe omitirse pedido si cliente ya apeló';
  ASSERT (v_res->>'reason') = 'customer_appealed',
    'REASON FALLÓ: Razón debe ser customer_appealed';

  RAISE NOTICE '[OK] Fallback omitido por apelación existente del cliente.';

  -- ===========================
  -- 6. FALLBACK VENCIDO E IDEMPOTENCIA
  -- ===========================
  v_res := public.create_fallback_appeal_review(v_order_id_due);
  ASSERT (v_res->>'skipped')::boolean = false,
    'FALLBACK FALLÓ: Debe crear reporte para pedido vencido sin apelación';
  ASSERT (v_res->>'reportId') IS NOT NULL,
    'FALLBACK FALLÓ: Debe retornar reportId';

  -- Segunda llamada: debe ser idempotente
  v_res := public.create_fallback_appeal_review(v_order_id_due);
  ASSERT (v_res->>'skipped')::boolean = true,
    'IDEMPOTENCIA FALLÓ: Segunda llamada debe ser skipped';
  ASSERT (v_res->>'reason') = 'fallback_already_exists',
    'REASON FALLÓ: Debe ser fallback_already_exists';

  SELECT COUNT(*) INTO v_report_count
  FROM public.reports
  WHERE order_id = v_order_id_due
    AND type = 'prepay_refund_review'
    AND created_by IS NULL;

  ASSERT v_report_count = 1,
    'UNICIDAD FALLÓ: Debe existir exactamente 1 reporte prepay_refund_review automático';

  RAISE NOTICE '[OK] Fallback automático creado de forma atómica e idempotente.';

  RAISE NOTICE '=== TODAS LAS PRUEBAS DE LA MIGRACIÓN 0068 PASARON SATISFACTORIAMENTE ===';
END $$;

ROLLBACK;
