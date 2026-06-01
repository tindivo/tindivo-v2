-- 0027_admin_metrics.sql
-- Fase F: agregación de métricas para el dashboard del admin (doc 08 §4/§5).
-- Una sola RPC read-only que devuelve KPIs del rango + monitor vivo + desgloses
-- por negocio / motorizado / razón de cancelación. Idempotente.

create or replace function public.admin_metrics(p_from timestamptz, p_to timestamptz)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_kpis jsonb; v_monitor jsonb; v_by_biz jsonb; v_by_drv jsonb; v_by_cancel jsonb;
  v_total int; v_delivered int; v_cancelled int; v_timeouts int;
  v_gmv numeric; v_commission numeric; v_avg_min numeric; v_cash numeric;
begin
  select
    count(*),
    count(*) filter (where status = 'delivered'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'cancelled' and cancel_reason in
      ('pending_acceptance_timeout', 'validation_timeout', 'prepay_timeout')),
    coalesce(sum(order_amount) filter (where status = 'delivered'), 0),
    coalesce(sum(tindivo_commission) filter (where status = 'delivered'), 0),
    coalesce(avg(extract(epoch from (delivered_at - created_at)) / 60)
      filter (where status = 'delivered' and delivered_at is not null), 0),
    coalesce(sum(order_amount) filter (where status = 'delivered' and payment_real = 'paid_cash'), 0)
  into v_total, v_delivered, v_cancelled, v_timeouts, v_gmv, v_commission, v_avg_min, v_cash
  from public.orders where created_at >= p_from and created_at < p_to;

  v_kpis := jsonb_build_object(
    'orders', v_total, 'delivered', v_delivered,
    'inProgress', greatest(0, v_total - v_delivered - v_cancelled),
    'cancelled', v_cancelled,
    'cancelledPct', case when v_total > 0 then round(100.0 * v_cancelled / v_total) else 0 end,
    'gmv', v_gmv, 'commission', v_commission,
    'avgTicket', case when v_delivered > 0 then round(v_gmv / v_delivered, 2) else 0 end,
    'avgMinutes', round(v_avg_min),
    'onTimePct', case when v_total > 0 then round(100.0 * (v_total - v_timeouts) / v_total) else 100 end,
    'cash', v_cash
  );

  -- Monitor: estado vivo actual (no acotado al rango).
  select jsonb_build_object(
    'pendingAcceptance', count(*) filter (where status = 'pending_acceptance'),
    'waitingDriver', count(*) filter (where status = 'waiting_driver'),
    'headingToRestaurant', count(*) filter (where status = 'heading_to_restaurant'),
    'pickedUp', count(*) filter (where status = 'picked_up')
  ) into v_monitor from public.orders
  where status in ('pending_acceptance', 'waiting_driver', 'heading_to_restaurant', 'picked_up');

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', b.name, 'total', t.total, 'delivered', t.delivered, 'cancelled', t.cancelled,
    'gmv', t.gmv, 'commission', t.commission
  ) order by t.gmv desc), '[]'::jsonb) into v_by_biz
  from (
    select business_id,
      count(*) total,
      count(*) filter (where status = 'delivered') delivered,
      count(*) filter (where status = 'cancelled') cancelled,
      coalesce(sum(order_amount) filter (where status = 'delivered'), 0) gmv,
      coalesce(sum(tindivo_commission) filter (where status = 'delivered'), 0) commission
    from public.orders where created_at >= p_from and created_at < p_to
    group by business_id
  ) t join public.businesses b on b.id = t.business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', d.full_name, 'deliveries', t.deliveries, 'inProgress', t.in_progress, 'gmv', t.gmv
  ) order by t.deliveries desc), '[]'::jsonb) into v_by_drv
  from (
    select driver_id,
      count(*) filter (where status = 'delivered') deliveries,
      count(*) filter (where status in ('heading_to_restaurant', 'waiting_at_restaurant', 'picked_up')) in_progress,
      coalesce(sum(order_amount) filter (where status = 'delivered'), 0) gmv
    from public.orders
    where driver_id is not null and created_at >= p_from and created_at < p_to
    group by driver_id
  ) t join public.drivers d on d.id = t.driver_id;

  select coalesce(jsonb_agg(jsonb_build_object('reason', cancel_reason, 'count', c) order by c desc), '[]'::jsonb)
  into v_by_cancel from (
    select cancel_reason, count(*) c from public.orders
    where status = 'cancelled' and cancel_reason is not null
      and created_at >= p_from and created_at < p_to
    group by cancel_reason
  ) z;

  return jsonb_build_object('kpis', v_kpis, 'monitor', v_monitor,
    'byBusiness', v_by_biz, 'byDriver', v_by_drv, 'byCancelReason', v_by_cancel);
end;
$$;

revoke all on function public.admin_metrics(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_metrics(timestamptz, timestamptz) to service_role;
