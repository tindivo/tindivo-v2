-- =============================================================================
-- ROLLBACK 0157 · Vuelve la rendición en bulto
-- =============================================================================
--
-- Restaura `create_cash_settlement` (versión 0141, la que ya lee
-- `order_cash_owed` en vez de deducir del método de pago) y
-- `confirm_cash_settlement` (versión 0018), y retira las dos funciones por
-- pedido.
--
-- ⚠️ LO QUE ESTE ROLLBACK **NO** DESHACE: las filas de `cash_settlements` con
-- `order_count = 1` que la 0157 ya haya creado. No hay nada que revertir en
-- ellas —son liquidaciones legítimas, con su dinero contado— y volver a
-- agruparlas reescribiría historia contable. Al restaurar la acumulación, un
-- ciclo por pedido que siga en `pending_confirmation` pasa a ser candidato a
-- acumular: la siguiente rendición del mismo día se le sumará encima. Es
-- consistente, pero conviene saberlo antes de correr esto con la noche abierta.
--
-- Correr esto exige revertir TAMBIÉN el código de las apps: los endpoints
-- `/driver/cash-settlements` y `/business/cash-settlements/[id]/confirm` llaman
-- a las funciones nuevas.
-- =============================================================================

drop function if exists public.deliver_order_cash(uuid, uuid);
drop function if exists public.confirm_order_cash(uuid, uuid);

-- ── create_cash_settlement, tal y como la dejó la 0141 ───────────────────────

CREATE OR REPLACE FUNCTION public.create_cash_settlement(p_driver_user_id uuid, p_business_id uuid, p_settlement_date date, p_delivered_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_driver_id uuid;
  v_expected numeric := 0;
  v_count int := 0;
  v_delivered numeric;
  v_open public.cash_settlements;
  v_id uuid;
  v_is_new boolean := false;
  v_order_ids uuid[];
begin
  select id into v_driver_id from public.drivers where user_id = p_driver_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  select coalesce(sum(public.order_cash_owed(o)), 0), count(*), array_agg(o.id)
    into v_expected, v_count, v_order_ids
  from public.orders o
  where o.business_id = p_business_id
    and o.driver_id = v_driver_id
    and o.status = 'delivered'
    and public.order_cash_owed(o) > 0
    and o.cash_settlement_id is null;

  if v_count = 0 then
    raise exception 'No hay pedidos en efectivo pendientes por rendir a este negocio'
      using errcode = 'P0001';
  end if;

  v_delivered := coalesce(p_delivered_amount, v_expected);

  select * into v_open
  from public.cash_settlements
  where business_id = p_business_id
    and driver_id = v_driver_id
    and status in ('pending_confirmation', 'disputed')
    and settlement_date = p_settlement_date
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.cash_settlements
      set total_cash = coalesce(total_cash, 0) + v_expected,
          order_count = coalesce(order_count, 0) + v_count,
          delivered_amount = coalesce(delivered_amount, 0) + v_delivered,
          delivered_at_ts = now(),
          status = 'pending_confirmation',
          updated_at = now()
      where id = v_open.id
      returning id into v_id;
  else
    v_is_new := true;
    insert into public.cash_settlements (
      business_id, driver_id, settlement_date, total_cash, order_count,
      status, delivered_amount, delivered_at_ts
    ) values (
      p_business_id, v_driver_id, p_settlement_date, v_expected, v_count,
      'pending_confirmation', v_delivered, now()
    ) returning id into v_id;
  end if;

  update public.orders
     set cash_settlement_id = v_id
   where id = any(v_order_ids);

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', v_id, 'CashDelivered', jsonb_build_object(
    'businessId', p_business_id, 'driverId', v_driver_id,
    'amount', v_delivered, 'expected', v_expected,
    'orderCount', v_count, 'isNewCycle', v_is_new
  ));

  return jsonb_build_object(
    'id', v_id, 'expected', v_expected, 'orderCount', v_count,
    'deliveredAmount', v_delivered, 'status', 'pending_confirmation',
    'isNewCycle', v_is_new
  );
end;
$function$;

-- ── confirm_cash_settlement, tal y como la dejó la 0018 ──────────────────────

create or replace function public.confirm_cash_settlement(
  p_id uuid,
  p_business_user_id uuid,
  p_confirmed_amount numeric
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cs public.cash_settlements;
  v_biz uuid;
begin
  select * into v_cs from public.cash_settlements where id = p_id for update;
  if not found then raise exception 'Liquidación no existe' using errcode = 'P0002'; end if;
  select id into v_biz from public.businesses where user_id = p_business_user_id;
  if v_biz is null or v_biz <> v_cs.business_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  if v_cs.status <> 'pending_confirmation' then
    return jsonb_build_object('confirmed', false, 'status', v_cs.status);
  end if;

  update public.cash_settlements
    set status = 'confirmed', confirmed_amount = p_confirmed_amount, confirmed_at = now(),
        confirmed_by = p_business_user_id, updated_at = now()
    where id = p_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', p_id, 'CashConfirmed', jsonb_build_object('amount', p_confirmed_amount));

  return jsonb_build_object('confirmed', true, 'status', 'confirmed');
end;
$$;

revoke execute on function public.create_cash_settlement(uuid, uuid, date, numeric) from public, anon, authenticated;
revoke execute on function public.confirm_cash_settlement(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.create_cash_settlement(uuid, uuid, date, numeric) to service_role;
grant execute on function public.confirm_cash_settlement(uuid, uuid, numeric) to service_role;
