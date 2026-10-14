-- ============================================================================
-- 0262 — cierre de `get_courier_tracking` y propiedad en `create_appeal_report` (SEC-2)
-- ============================================================================
--
-- 1. `get_courier_tracking(text)` (0236) es SECURITY DEFINER y estaba concedida a
--    `anon, authenticated`: cualquiera con un `short_id` ajeno la llamaba DIRECTO
--    en PostgREST y recibía la carrera de otro (nombres, coordenadas de origen y
--    destino, descripción, tarifa, motorizado, fechas). Desde ahora solo la
--    ejecutan `service_role` (la API: `GET /public/courier/{shortId}`, el enlace
--    que se comparte) y su dueño `postgres`.
--
--    Inventario de consumidores (medido en el repo, 2026-10-13):
--      · apps/api/app/api/v1/public/courier/[shortId]/route.ts: service_role. NO cambia.
--      · apps/customer/lib/active-courier-orders.ts: la llamaba con la sesión del
--        cliente SOLO para leer `driverName` de sus entregas activas. Ahora lee
--        `driverName` de `GET /customer/courier-orders` (aditivo, con propiedad).
--      · apps/customer use-courier-tracking.ts ya iba por la API pública.
--      · Ninguna función SQL la llama.
--
--    Estado ANTES: `grant execute … to anon, authenticated, service_role` (0236).
--    Para restaurar exacto:
--      grant execute on function public.get_courier_tracking(text) to anon, authenticated;
--
--    Sin DROP + CREATE: se perdería el ACL. Idempotente, y neutra frente a
--    cualquier otra migración que también la revoque (la 0261), antes o después.
--
-- 2. `create_appeal_report(uuid, text)` (0150):
--    · `IF v_order.customer_user_id <> v_customer_user_id` no rechazaba cuando
--      `orders.customer_user_id` era NULL (la comparación da NULL, no true): un
--      cliente que conociera el UUID apelaba un pedido sin dueño como suyo y
--      copiaba el teléfono y el comprobante ajenos. Ahora el pedido se busca por
--      UUID Y dueño (`customer_user_id = auth.uid()`; con NULL nunca coincide).
--    · Un pedido ajeno, uno sin dueño y uno inexistente dan el MISMO error (P0002
--      «Pedido no existe»), para que el UUID no sirva de sonda.
--    · `cancel_reason IS NULL` pasaba el `NOT IN` (NULL NOT IN (...) es NULL).
--      Ahora se rechaza de forma explícita.
--    Misma firma, mismos grants (CREATE OR REPLACE) y mismo comportamiento para
--    el caso legítimo. No toca dinero (business_charges, reembolsos).
-- ============================================================================

-- ── 1. get_courier_tracking: fuera anon/authenticated ───────────────────────
do $revoke$
begin
  revoke execute on function public.get_courier_tracking(text) from public, anon, authenticated;
  grant execute on function public.get_courier_tracking(text) to service_role;
  -- postgres es el dueño: conserva EXECUTE por serlo.
end
$revoke$;

-- ── 2. create_appeal_report: propiedad y motivo ─────────────────────────────
CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_customer_user_id uuid;
  v_existing_id uuid;
  v_deadline timestamptz;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  -- Por UUID y dueño desde el principio: ajeno, sin dueño e inexistente son
  -- indistinguibles para quien llama (con customer_user_id NULL la igualdad no
  -- se cumple nunca).
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND customer_user_id = v_customer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  IF v_order.status IS DISTINCT FROM 'cancelled'
     OR v_order.cancel_reason IS NULL
     OR v_order.cancel_reason NOT IN ('proof_rejected_final', 'prepay_timeout') THEN
    RAISE EXCEPTION 'Solo se puede apelar pedidos cancelados por rechazo de comprobante o tiempo expirado' USING errcode = 'P0001';
  END IF;

  IF v_order.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'El pedido no cuenta con fecha de cancelación registrada' USING errcode = 'P0001';
  END IF;

  v_deadline := v_order.cancelled_at + interval '24 hours';
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'La ventana de apelación de 24 horas ha expirado' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.reports
  WHERE order_id = p_order_id
    AND type = 'rejected_proof_disputed';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyExisted', true, 'reportId', v_existing_id);
  END IF;

  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by,
    appeal_status, appeal_deadline
  ) VALUES (
    'rejected_proof_disputed', 'open', p_order_id, v_order.business_id,
    v_customer_user_id, v_order.customer_phone,
    COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago'),
    v_order.comprobante_prepago_url,
    v_customer_user_id,
    'pending', v_deadline
  )
  RETURNING id INTO v_existing_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', v_customer_user_id,
    jsonb_build_object(
      'reportId', v_existing_id,
      'evidence_url', v_order.comprobante_prepago_url,
      'description', COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago')
    )
  );

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'order/appeal.created', jsonb_build_object(
    'order_id', p_order_id,
    'report_id', v_existing_id,
    'business_id', v_order.business_id,
    'customer_user_id', v_customer_user_id,
    'appeal_deadline', v_deadline
  ));

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'get_courier_tracking';
  if n <> 1 then
    raise exception '0262: se esperaba UNA sola get_courier_tracking y hay %', n;
  end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'create_appeal_report';
  if n <> 1 then
    raise exception '0262: se esperaba UNA sola create_appeal_report y hay %', n;
  end if;
  if has_function_privilege('anon', 'public.get_courier_tracking(text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_courier_tracking(text)', 'execute') then
    raise exception '0262: get_courier_tracking sigue ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.get_courier_tracking(text)', 'execute') then
    raise exception '0262: service_role perdió EXECUTE sobre get_courier_tracking';
  end if;
  if not has_function_privilege('authenticated', 'public.create_appeal_report(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.create_appeal_report(uuid, text)', 'execute') then
    raise exception '0262: cambiaron los grants de create_appeal_report';
  end if;
end
$check$;
