-- =============================================================================
-- 0016 · RPC de expiración por timeout del sistema (lo usa Inngest)
-- Cancela un pedido cuando vence un deadline (aceptación/validación/prepago) SIN
-- actor humano. Re-chequea el estado bajo FOR UPDATE (anti-carrera: el negocio
-- pudo aceptar justo al saltar el timer) → idempotente. outbox + auditoría
-- ('system') en la misma transacción. Solo service_role.
-- =============================================================================

create or replace function public.expire_order(
  p_order_id uuid,
  p_reason public.cancel_reason
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  -- Cada timeout vigila un estado concreto. Si el flujo ya avanzó, no expira
  -- (idempotente y anti-carrera).
  if p_reason = 'pending_acceptance_timeout' and v_order.status <> 'pending_acceptance' then
    return jsonb_build_object('expired', false, 'status', v_order.status);
  end if;
  if p_reason = 'validation_timeout' and v_order.status <> 'validando' then
    return jsonb_build_object('expired', false, 'status', v_order.status);
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    return jsonb_build_object('expired', false, 'status', v_order.status);
  end if;

  update public.orders
    set status = 'cancelled', cancel_reason = p_reason, cancelled_by = null
    where id = p_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderExpired', jsonb_build_object('reason', p_reason));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.expired', 'system', null, jsonb_build_object('reason', p_reason));

  return jsonb_build_object('expired', true, 'reason', p_reason);
end;
$$;

revoke execute on function public.expire_order(uuid, public.cancel_reason) from public, anon, authenticated;
grant execute on function public.expire_order(uuid, public.cancel_reason) to service_role;
