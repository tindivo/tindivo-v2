-- =============================================================================
-- 0012 · RPC de transición de estado del pedido (ciclo de vida operativo)
-- Centraliza TODA mutación de estado: guards from-state + rol + propiedad, con
-- SELECT FOR UPDATE (serializa concurrencia). Snapshot de comisión en pickup.
-- outbox + auditoría en la misma transacción. Solo service_role la ejecuta.
-- Idempotente.
-- =============================================================================

create or replace function public.advance_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_params jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commissions jsonb;
  v_prep int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  select * into v_business from public.businesses where id = v_order.business_id;

  -- Resolución/propiedad del actor.
  if p_actor_role = 'business' then
    if v_business.user_id <> p_actor_user_id then
      raise exception 'No autorizado sobre este pedido' using errcode = 'P0001';
    end if;
  elsif p_actor_role = 'driver' then
    select id into v_driver_id from public.drivers where user_id = p_actor_user_id;
    if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;
  end if;

  case p_action
    when 'accept' then
      if p_actor_role <> 'business' then raise exception 'Acción solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'pending_acceptance' then raise exception 'El pedido no esta pendiente de aceptacion' using errcode = 'P0001'; end if;
      v_new_status := 'confirmed';
    when 'preparing' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'confirmed' then raise exception 'El pedido no esta confirmado' using errcode = 'P0001'; end if;
      v_prep := greatest(1, coalesce((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';
    when 'ready' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'preparing' then raise exception 'El pedido no esta en preparacion' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_driver';
    when 'take' then
      if p_actor_role <> 'driver' then raise exception 'Accion solo del motorizado' using errcode = 'P0001'; end if;
      if v_order.status not in ('preparing', 'waiting_driver') then raise exception 'El pedido no esta disponible para tomar' using errcode = 'P0001'; end if;
      if v_order.driver_id is not null and v_order.driver_id <> v_driver_id then raise exception 'El pedido ya tiene motorizado' using errcode = 'P0001'; end if;
      v_new_status := 'heading_to_restaurant';
    when 'arrived' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'heading_to_restaurant' then raise exception 'El motorizado no va al local' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_at_restaurant';
    when 'pickup' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'waiting_at_restaurant' then raise exception 'El pedido no esta listo para recoger' using errcode = 'P0001'; end if;
      v_band := (p_params ->> 'band')::public.distance_band;
      if v_order.delivery_method = 'delivery' and v_band is null then
        raise exception 'Declara la banda (cerca/lejos)' using errcode = 'P0001';
      end if;
      v_new_status := 'picked_up';
    when 'deliver' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'El pedido no esta recogido' using errcode = 'P0001'; end if;
      v_new_status := 'delivered';
    when 'cancel' then
      if p_actor_role not in ('business', 'admin') then raise exception 'No autorizado para cancelar' using errcode = 'P0001'; end if;
      if v_order.status in ('delivered', 'cancelled') then raise exception 'El pedido ya esta cerrado' using errcode = 'P0001'; end if;
      v_new_status := 'cancelled';
    else
      raise exception 'Accion desconocida: %', p_action using errcode = 'P0001';
  end case;

  -- Efectos por acción.
  if p_action = 'take' then
    update public.orders set status = v_new_status, driver_id = v_driver_id where id = p_order_id;
  elsif p_action = 'preparing' then
    update public.orders
      set status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - 10) || ' minutes')::interval
      where id = p_order_id;
  elsif p_action = 'pickup' then
    select value into v_commissions from public.app_settings where key = 'commissions';
    if v_order.delivery_method = 'pickup' then
      v_commission := coalesce(v_business.commission_override_pickup, (v_commissions ->> 'pickup')::numeric, 0.50);
    elsif v_band = 'near' then
      v_commission := coalesce(v_business.commission_override_near, (v_commissions ->> 'near')::numeric, 3.00);
    else
      v_commission := coalesce(v_business.commission_override_far, (v_commissions ->> 'far')::numeric, 3.50);
    end if;
    update public.orders
      set status = v_new_status, delivery_distance_band = v_band, tindivo_commission = v_commission
      where id = p_order_id;
  elsif p_action = 'deliver' then
    update public.orders
      set status = v_new_status,
          payment_real = coalesce((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      where id = p_order_id;
  elsif p_action = 'cancel' then
    update public.orders
      set status = v_new_status,
          cancel_reason = coalesce((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled'),
          cancelled_by = p_actor_user_id
      where id = p_order_id;
  else
    update public.orders set status = v_new_status where id = p_order_id;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);

  return (
    select jsonb_build_object(
      'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
      'band', delivery_distance_band, 'tindivoCommission', tindivo_commission,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes
    ) from public.orders where id = p_order_id
  );
end;
$$;

revoke execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) from public, anon, authenticated;
grant execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) to service_role;
