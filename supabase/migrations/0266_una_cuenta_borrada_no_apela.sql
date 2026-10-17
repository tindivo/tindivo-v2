-- ============================================================================
-- 0266 — una cuenta borrada no puede apelar (PROD-001)
-- ============================================================================
--
-- PROBLEMA. `delete_customer_account` (0259) anonimiza los pedidos y el log de eventos, y
-- deja la lápida en `public.users` (`deleted_at`). Pero `create_appeal_report` (0262,
-- SECURITY DEFINER, la ejecuta `authenticated`) no miraba `deleted_at`: la sesión del
-- cliente, cuyo JWT sigue siendo válido tras el borrado, llegaba a la RPC DESPUÉS del
-- commit del borrado, creaba una apelación de una cuenta borrada y escribía
-- `p_description` (texto personal) en `order_event_log` ya anonimizado. Un segundo
-- borrado devuelve `already_deleted` y no limpia. `reports`, `order_event_log` y
-- `domain_events` no tienen el disparador `trg_reject_deleted_account`. Esta era la única
-- función DEFINER ejecutable por el cliente que escribía en tablas sin ese guard.
--
-- ARREGLO. Al principio de la RPC (después de «Usuario no autenticado», antes de leer o
-- bloquear el pedido) se toma la fila del usuario con FOR SHARE: si no existe o tiene
-- `deleted_at`, P0001 «Esta cuenta fue eliminada» con HINT `account_deleted`.
--
-- POR QUÉ NO HAY CARRERA. `delete_customer_account` toma `users` FOR UPDATE (tras su
-- candado de aviso de la libreta, que esta RPC no usa) y solo después toca pedidos,
-- reportes y logs. Esta RPC toma `users` FOR SHARE y solo después el pedido. Mismo orden
-- en ambas, sin abrazo mortal, y los dos candados se esperan entre sí:
--   · si la apelación entra primero, el borrado espera a que termine (READ COMMITTED: al
--     despertar su `account_deletion_blockers` ya ve el reporte) y devuelve `blocked`
--     por dinero abierto;
--   · si el borrado entra primero, la apelación espera, lee la lápida y falla con
--     `account_deleted` sin escribir nada.
--
-- El cuerpo es el de la 0262 IDÉNTICO salvo la variable `v_deleted` y el bloque marcado
-- entre `>>> 0266` y `<<< 0266` (un test lo comprueba). Misma firma, mismos grants. La
-- ruta de la API ya mapea P0001 a `validation_error`: no cambia. No toca dinero
-- (business_charges, reembolsos) ni el esquema.
-- ============================================================================

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
  v_deleted timestamptz; -- 0266
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  -- >>> 0266
  -- Una cuenta borrada no apela. El JWT sigue siendo válido tras el borrado, así que
  -- la sesión puede llegar aquí con la lápida ya puesta. El FOR SHARE sobre `users`
  -- va ANTES de leer o bloquear el pedido (orden de candados: users, luego pedido),
  -- el mismo orden de `delete_customer_account`, que toma `users` FOR UPDATE.
  SELECT u.deleted_at INTO v_deleted
  FROM public.users u
  WHERE u.id = v_customer_user_id
  FOR SHARE;
  IF NOT FOUND OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Esta cuenta fue eliminada' USING errcode = 'P0001', hint = 'account_deleted';
  END IF;
  -- <<< 0266

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

-- Mismos permisos que dejó la 0262 (medido en el catálogo local: postgres y authenticated).
REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, text) TO authenticated;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  n int;
  v_cfg text[];
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'create_appeal_report';
  if n <> 1 then
    raise exception '0266: se esperaba UNA sola create_appeal_report y hay %', n;
  end if;
  select p.proconfig into v_cfg from pg_proc p
   where p.oid = 'public.create_appeal_report(uuid, text)'::regprocedure;
  if v_cfg is null or not ('search_path=""' = any (v_cfg)) then
    raise exception '0266: create_appeal_report perdió el search_path vacío (%)', v_cfg;
  end if;
  if not has_function_privilege('authenticated', 'public.create_appeal_report(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.create_appeal_report(uuid, text)', 'execute') then
    raise exception '0266: cambiaron los grants de create_appeal_report';
  end if;
end
$check$;
