-- 0041_tracking_item_modifiers.sql
-- Customer-facing fix: get_tracking items now include the selected modifiers
-- (snapshots from customer_order_item_modifiers) so the tracking screen can show
-- exactly what was ordered ("adicionales"). Same signature/window/grants as 0024;
-- CREATE OR REPLACE preserves the existing grants (anon).
-- Idempotente.

create or replace function public.get_tracking(p_short_id text)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total,
          'modifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'group', m.group_name_snapshot,
                'name', m.option_name_snapshot,
                'price', m.additional_price_snapshot
              )
              order by m.created_at
            )
            from public.customer_order_item_modifiers m where m.item_id = i.id
          ), '[]'::jsonb)
        )
        order by i.created_at
      )
      from public.customer_order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.orders o
  join public.businesses b on b.id = o.business_id
  left join public.drivers d on d.id = o.driver_id
  where o.short_id = p_short_id
    and (o.delivered_at is null or o.delivered_at > now() - interval '24 hours');
  return v_result;
end;
$$;
