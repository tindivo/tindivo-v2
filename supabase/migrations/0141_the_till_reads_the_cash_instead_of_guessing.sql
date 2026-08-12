-- =============================================================================
-- 0141 · El corte de caja LEE cuanto efectivo lleva el motorizado.
--
-- Cierra lo que abrio 0140. Hasta aqui la liquidacion DEDUCIA el efectivo del
-- metodo de pago, y esa deduccion se repetia en cuatro sitios: este RPC, el
-- `create_cash_settlement` de 0018, el enlace de pedidos de 0111 y el endpoint
-- `/driver/cash-settlements`. Cuatro copias de una regla divergen; en esta app
-- ya ha pasado con el vuelto, con el reloj y con los colores del estado.
--
-- QUE CAMBIA DE VERDAD.
--   Un pedido `paid_mixed` pasa a contar SU PARTE EN EFECTIVO. Antes quedaba
--   fuera del corte —lo perdia el negocio— y meterlo en el filtro tal cual le
--   habria exigido al motorizado el total, incluida la parte cobrada por Yape.
--   Ninguna de las dos era aceptable, y por eso la hoja de entrega no ofrecia
--   la opcion.
--
--   Para `paid_cash` el importe es IDENTICO al de antes (el total), asi que
--   ninguna liquidacion existente cambia de numero. Los tests lo comprueban.
--
-- BACKFILL.
--   Las filas entregadas antes de 0140 tienen `cash_owed_at_delivery` en NULL.
--   Se rellenan con la regla vieja, que para ellas es la correcta: eran
--   todo-efectivo o nada. Idempotente — solo toca las que estan a NULL.
--
-- NO SE TOCAN los ciclos ya cerrados: el backfill escribe en `orders`, y
-- `cash_settlements` conserva los totales con los que la cajera conto el fajo.
-- Volver a calcularlos reescribiria historia contable.
--
-- `confirm_cash_settlement`, `dispute_cash_settlement` y `resolve_cash_settlement`
-- no se tocan: se comprobo que ninguna lee `payment_real` ni `order_amount`.
--
-- Idempotente. El cuerpo del RPC sale de `pg_get_functiondef` de la definicion
-- viva, cambiando UNICAMENTE el select que elige los pedidos.
-- =============================================================================

-- ── 1. Cuanto efectivo lleva el motorizado por un pedido ─────────────────────
--
-- En una funcion y no repetida en cada consumidor: es LA regla del corte de
-- caja, y tenerla en un solo sitio es justamente lo que faltaba.
create or replace function public.order_cash_owed(o public.orders)
returns numeric
language sql
immutable
as $$
  select coalesce(
    o.cash_owed_at_delivery,
    -- Filas anteriores a 0140. Para ellas la regla vieja es exacta: el cobro
    -- era todo-o-nada, asi que un `paid_cash` debia el total y el resto nada.
    case when o.payment_real = 'paid_cash'
         then coalesce(o.order_amount, 0) + coalesce(o.delivery_fee, 0)
         else 0 end
  )
$$;

comment on function public.order_cash_owed(public.orders) is
  'Efectivo que el motorizado lleva encima por un pedido. Fuente unica del corte de caja (0141).';

-- ── 2. Backfill de lo ya entregado ───────────────────────────────────────────
update public.orders
   set cash_owed_at_delivery =
         case when payment_real = 'paid_cash'
              then coalesce(order_amount, 0) + coalesce(delivery_fee, 0)
              else 0 end
 where status = 'delivered'
   and cash_owed_at_delivery is null;

-- ── 3. El RPC de liquidacion ─────────────────────────────────────────────────

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

  -- 1. Los pedidos que este motorizado lleva cobrados y SIN rendir a este
  --    negocio. Es el conjunto que define la rendición: no la fecha.
  -- LA LIQUIDACION YA NO DEDUCE EL EFECTIVO DEL METODO: LO LEE (0141).
  --
  -- Antes filtraba `payment_real = 'paid_cash'` y sumaba el TOTAL del pedido.
  -- Eso daba dos resultados malos en cuanto el cobro no era todo-o-nada:
  --   · un mixto quedaba FUERA del corte con el motorizado llevando su parte
  --     en efectivo — lo perdia el negocio;
  --   · y si se hubiera metido en el filtro tal cual, se le habria exigido el
  --     TOTAL, incluida la parte que fue por Yape — lo pagaba el motorizado.
  --
  -- `cash_owed_at_delivery` lo escribe `advance_order('deliver')` desde 0140 y
  -- responde exactamente lo que hace falta aqui: cuanto efectivo se lleva el
  -- motorizado por ese pedido. El `coalesce` es para filas anteriores a 0140
  -- que el backfill de esta misma migracion no hubiera alcanzado: mejor volver
  -- a la regla vieja que contar cero.
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

  -- 2. ¿Hay un ciclo ABIERTO? Abierto = entregado pero aún sin cerrar por la
  --    cajera. Se acota al mismo día: un ciclo de ayer no acumula (ver
  --    cabecera). FOR UPDATE porque dos rendiciones simultáneas del mismo
  --    motorizado no deben duplicar el ciclo.
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
    -- Acumula sobre el ciclo abierto. La cajera cuenta un fajo, no cuatro.
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

  -- 3. Enlaza los pedidos, en la MISMA transacción que el paso 2.
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
$function$
