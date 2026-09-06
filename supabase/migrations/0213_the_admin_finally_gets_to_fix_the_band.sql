-- =============================================================================
-- 0213 · El admin por fin puede corregir la banda
-- =============================================================================
--
-- Spec: Docs/spec/spec-edicion-pedido-manual.md §3.2 y §4, y la cabecera de
-- 0190, que dejaron la banda explícitamente FUERA de lo que la cajera puede
-- editar con una frase textual: "si el envío está mal cobrado, lo corrige un
-- admin". Esta migración construye ese "lo corrige un admin", que hasta ahora
-- no existía en ningún camino.
--
-- POR QUÉ HACE FALTA
-- La cajera elige la banda al crear un pedido manual (0126). Por apuro marca
-- "Cerca" siempre, incluso en entregas lejanas. Eso no cambia lo que paga el
-- cliente (paga el total que la cajera le dice), pero sí cambia lo que el
-- negocio le debe a Tindivo: `delivery_fee_charged` sale del `delivery_fee`
-- que quedó grabado en el pedido, y eso es lo que `generate_delivery_charges`
-- copia a `business_charges.delivery_fee` al entregar. Con `near` en vez de
-- `far`, Tindivo cobra de menos por esa carrera.
--
-- QUÉ NO TOCA
-- La comisión es plana desde la 0125 (`commissions.delivery`, igual para
-- `near` y `far`): esta función NO recalcula `commission_amount`, ni el cargo
-- `commission` de `business_charges`. Solo mueve el envío.
--
-- CÓMO SE INTEGRA CON EL LEDGER YA EXISTENTE
-- No se toca `balance_due` a mano. Se actualiza el cargo `delivery_fee`
-- `pending` de `business_charges`, y el trigger `trg_business_charges_recalc_balance`
-- (0124) recalcula el saldo del negocio solo, como con cualquier otro cargo.
--
-- QUÉ PASA SI EL CARGO YA SE LIQUIDÓ
-- Se rechaza. Corregir un cargo `settled` es una reconciliación distinta
-- (¿se cobra la diferencia aparte? ¿se ajusta el próximo corte?), y mezclarla
-- aquí sería una decisión de producto colada en una migración de bug fix.
--
-- FUNCIÓN NUEVA, SIN OVERLOAD QUE VIGILAR
-- No hay una versión anterior de `admin_correct_delivery_band`: no aplica el
-- riesgo de RIESGOS-LEDGER.md §2.9 (`CREATE OR REPLACE` con firma distinta
-- deja sobrecargas vivas). Aun así se emiten REVOKE/GRANT explícitos, como
-- exige toda función de dinero del repo.
-- =============================================================================


-- ── 1 · `delivery_fee_source` gana un cuarto valor ───────────────────────────
-- Ya admite 'business' (cajera eligió), 'system' (cayó al default) y 'promo'
-- (0187). 'admin' dice, leyendo la fila sola, que la banda la corrigió un
-- admin después de la entrega — sin tener que ir a `order_event_log`.
alter table public.orders drop constraint if exists orders_delivery_fee_source_check;
alter table public.orders add constraint orders_delivery_fee_source_check
  check (
    delivery_fee_source is null
    or delivery_fee_source in ('business', 'system', 'promo', 'admin')
  );


-- ── 2 · La función ────────────────────────────────────────────────────────────
create or replace function public.admin_correct_delivery_band(
  p_order_id uuid,
  p_admin_user_id uuid,
  p_new_band public.distance_band
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders;
  v_business public.businesses;
  v_bands jsonb;
  v_charge_id uuid;
  v_total_paid numeric;
  v_new_delivery_fee numeric;
  v_new_order_amount numeric;
  v_old_delivery_fee numeric;
  v_old_band public.distance_band;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no existe' using errcode = 'P0002';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'Solo se corrige la banda de pedidos entregados' using errcode = 'P0001';
  end if;

  if v_order.delivery_method <> 'delivery' or v_order.delivery_distance_band is null then
    raise exception 'Este pedido no tiene banda de entrega (es recojo)' using errcode = 'P0001';
  end if;

  select id into v_charge_id
    from public.business_charges
   where order_id = p_order_id
     and charge_type = 'delivery_fee'
     and status = 'pending'
   limit 1;

  if v_charge_id is null then
    raise exception 'El cargo de envío de este pedido ya fue liquidado; no se puede corregir' using errcode = 'P0001';
  end if;

  v_old_band := v_order.delivery_distance_band;
  v_old_delivery_fee := v_order.delivery_fee_charged;

  -- Idempotente: pedir la misma banda que ya tiene no falla ni mueve nada.
  if p_new_band = v_old_band then
    return jsonb_build_object(
      'id', v_order.id, 'shortId', v_order.short_id, 'band', v_old_band,
      'deliveryFeeCharged', v_old_delivery_fee, 'tindivoCommission', v_order.tindivo_commission,
      'orderAmount', v_order.order_amount, 'unchanged', true
    );
  end if;

  select * into v_business from public.businesses where id = v_order.business_id;

  -- Lo que el cliente ya pagó no cambia: solo se re-parte entre comida y
  -- envío. Misma cuenta que create_business_manual_order (0126/0190).
  v_total_paid := v_order.order_amount + v_order.delivery_fee;

  select value into v_bands from public.app_settings where key = 'delivery_bands';
  v_new_delivery_fee := coalesce(
    (v_bands ->> p_new_band::text)::numeric,
    v_business.delivery_fee,
    2.00
  );

  v_new_order_amount := round(v_total_paid - v_new_delivery_fee, 2);
  if v_new_order_amount <= 0 then
    raise exception 'El envío de la banda corregida (%) supera el total que pagó el cliente', v_new_delivery_fee
      using errcode = 'P0001';
  end if;

  update public.orders set
    delivery_distance_band = p_new_band,
    delivery_fee = v_new_delivery_fee,
    order_amount = v_new_order_amount,
    delivery_fee_charged = v_new_delivery_fee,
    tindivo_commission = coalesce(commission_amount, 0) + v_new_delivery_fee,
    delivery_fee_source = 'admin'
  where id = p_order_id;

  -- Dispara trg_business_charges_recalc_balance: balance_due se recalcula solo.
  update public.business_charges set
    amount = v_new_delivery_fee,
    description = 'Delivery fee pedido #' || v_order.short_id || ' (corregido por admin)'
  where id = v_charge_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'AdminCorrectedDeliveryBand', jsonb_build_object(
    'oldBand', v_old_band, 'newBand', p_new_band,
    'oldDeliveryFeeCharged', v_old_delivery_fee, 'newDeliveryFeeCharged', v_new_delivery_fee,
    'adminUserId', p_admin_user_id
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.admin_correct_band', 'admin', p_admin_user_id, jsonb_build_object(
    'oldBand', v_old_band, 'newBand', p_new_band,
    'oldDeliveryFeeCharged', v_old_delivery_fee, 'newDeliveryFeeCharged', v_new_delivery_fee
  ));

  return jsonb_build_object(
    'id', p_order_id, 'shortId', v_order.short_id, 'band', p_new_band,
    'deliveryFeeCharged', v_new_delivery_fee,
    'tindivoCommission', coalesce(v_order.commission_amount, 0) + v_new_delivery_fee,
    'orderAmount', v_new_order_amount, 'unchanged', false
  );
end;
$function$;

revoke all on function public.admin_correct_delivery_band(uuid, uuid, public.distance_band)
  from public, anon, authenticated;
grant execute on function public.admin_correct_delivery_band(uuid, uuid, public.distance_band)
  to service_role;
