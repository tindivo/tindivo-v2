-- =============================================================================
-- 0034 · validate_order: rechazo manual del negocio.
--   · cancel_reason = 'business_cancelled' (antes 'validation_timeout', que es
--     el motivo del CRON, no de un rechazo manual del operador).
--   · acepta p_reason_code y lo persiste en rejection_reason_code (antes se
--     descartaba el código estructurado para contraentrega).
-- Nueva firma (agrega p_reason_code). Idempotente.
-- =============================================================================

drop function if exists public.validate_order(uuid, uuid, public.user_role, boolean, text);

create function public.validate_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_pass boolean,
  p_reason text default null,
  p_reason_code text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.status <> 'validando' then
    return jsonb_build_object('ok', false, 'status', v_order.status);
  end if;
  if p_actor_role = 'business' then
    select * into v_business from public.businesses where id = v_order.business_id;
    if v_business.user_id <> p_actor_user_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  elsif p_actor_role <> 'admin' then
    raise exception 'Solo el negocio o admin validan' using errcode = 'P0001';
  end if;

  if p_pass then
    update public.orders
      set status = 'pending_acceptance',
          payment_proof_status = case when v_order.payment_intent = 'prepaid' then 'verified' else payment_proof_status end,
          payment_verified_at  = case when v_order.payment_intent = 'prepaid' then now() else payment_verified_at end,
          payment_verified_by  = case when v_order.payment_intent = 'prepaid' then p_actor_user_id else payment_verified_by end
      where id = p_order_id;
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'pending_acceptance');
  else
    update public.orders
      set status = 'cancelled',
          cancel_reason = 'business_cancelled',
          cancelled_by = p_actor_user_id,
          cancel_note = p_reason,
          payment_proof_status  = case when v_order.payment_intent = 'prepaid' then 'rejected' else payment_proof_status end,
          rejection_reason_code = coalesce(
            nullif(p_reason_code, ''),
            case when v_order.payment_intent = 'prepaid' then 'invalid_proof' else null end),
          rejection_reason_text = p_reason,
          rejected_at = now(),
          rejected_by = p_actor_user_id
      where id = p_order_id;
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail', 'status', 'cancelled'));
    insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    values (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id,
      jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code));
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
end;
$$;

revoke execute on function public.validate_order(uuid, uuid, public.user_role, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_order(uuid, uuid, public.user_role, boolean, text, text)
  to service_role;
