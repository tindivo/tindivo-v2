-- 0150 · La apelacion del cliente vuelve a poder crearse.
--
-- QUE ROMPIA. `create_appeal_report` insertaba `p_order_id::text` en
-- `domain_events.aggregate_id`, que es `uuid`. Postgres no tiene cast de
-- asignacion de text a uuid, asi que la sentencia revienta con 42804 --
-- "column aggregate_id is of type uuid but expression is of type text" -- y
-- como es la ULTIMA sentencia de la funcion, se lleva por delante la
-- transaccion entera: ni el `reports` ni el `order_event_log` que se insertaron
-- antes sobreviven. El cliente que apela un comprobante rechazado recibe un
-- error y su apelacion no queda registrada en ningun sitio.
--
-- Reproducido el 2026-08-13 contra la base local:
--   insert into domain_events (..., aggregate_id, ...) values (..., uuid::text, ...)
--   -> ERROR: column "aggregate_id" is of type uuid but expression is of type text
--
-- Lo encontro `supabase db lint --linked`, que lo reportaba como el unico
-- `level: error` del esquema. Estaba ahi desde la 0099.
--
-- QUE CAMBIA. Se quita el `::text`. `p_order_id` ya es `uuid` y la columna
-- tambien; el cast no aportaba nada y era el fallo. El resto es copia literal
-- de la 0099. Idempotente (CREATE OR REPLACE).

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

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  IF v_order.customer_user_id <> v_customer_user_id THEN
    RAISE EXCEPTION 'No autorizado para apelar este pedido' USING errcode = 'P0001';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason NOT IN ('proof_rejected_final', 'prepay_timeout') THEN
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
