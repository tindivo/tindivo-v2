-- =============================================================================
-- ROLLBACK 0141 · Devuelve el corte de caja a deducir el efectivo
-- =============================================================================
--
-- ⚠️ EL BACKFILL NO SE DESHACE, Y NO ES UN OLVIDO.
--
--    La 0141 rellenó `orders.cash_owed_at_delivery` en las filas ya entregadas
--    que lo tenían NULL. No hay forma de distinguir después cuáles rellenó el
--    backfill y cuáles escribió `deliver` (0140) al entregar: la columna no
--    guarda esa procedencia.
--
--    Ponerlas todas a NULL borraría el dato REAL de las entregas hechas bajo la
--    0140, que es justo el que arregló el corte de caja de los pedidos mixtos.
--    Así que este rollback DEJA LOS VALORES donde están.
--
--    Es seguro dejarlos: con `order_cash_owed` eliminada, nadie los lee. Quedan
--    como dato inerte hasta que se vuelva a aplicar la 0141, momento en el que
--    su backfill los respeta (solo toca los NULL).
--
--    Si de verdad hace falta limpiarlos, hay que acotar por fecha a mano y
--    saber lo que se está borrando:
--      update public.orders set cash_owed_at_delivery = null
--       where status = 'delivered' and delivered_at < '<fecha del push de 0141>';
--
-- ⚠️ QUÉ CAMBIA DE IMPORTE AL REVERTIR. Un pedido `paid_mixed` vuelve a quedar
--    FUERA del corte de caja: su parte en efectivo deja de exigírsele al
--    motorizado. Para `paid_cash` el importe es idéntico, así que ninguna
--    liquidación de solo-efectivo cambia de número.
--
-- ⚠️ ORDEN. Si están aplicadas 0146 y/o 0140, revertirlas DESPUÉS de esta:
--    `order_cash_owed` desaparece aquí, y las otras no la usan.
--
-- `create_cash_settlement` se restaura con la definición EXACTA de la 0111
-- (`supabase/migrations/0111_cash_settlement_cycles.sql`, líneas 95-188).
-- =============================================================================

-- 1. Fuera la función que centralizaba la regla. `create_cash_settlement` deja
--    de usarla en el paso 2, así que el orden importa: primero el reemplazo,
--    después el DROP. Se hace al revés y falla por dependencia.
create or replace function public.create_cash_settlement(
  p_driver_user_id uuid,
  p_business_id uuid,
  p_settlement_date date,
  p_delivered_amount numeric default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
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
  select coalesce(sum(o.order_amount + o.delivery_fee), 0), count(*), array_agg(o.id)
    into v_expected, v_count, v_order_ids
  from public.orders o
  where o.business_id = p_business_id
    and o.driver_id = v_driver_id
    and o.status = 'delivered'
    and o.payment_real = 'paid_cash'
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
$$;

-- 2. Ahora sí: fuera `order_cash_owed`, que ya no la usa nadie.
DROP FUNCTION IF EXISTS public.order_cash_owed(public.orders);

-- 3. Guard: que no quede ninguna referencia viva a la función eliminada.
DO $$
DECLARE v_refs int;
BEGIN
  SELECT count(*) INTO v_refs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%order_cash_owed%';
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'rollback 0141 incompleto: % función(es) siguen llamando a order_cash_owed', v_refs
      USING errcode = 'P0001';
  END IF;
END $$;
