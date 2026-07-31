-- =============================================================================
-- 0111 · Varias rendiciones de efectivo por noche
-- =============================================================================
--
-- EL PROBLEMA
-- `create_cash_settlement` agrupaba por (business_id, driver_id,
-- settlement_date) — una fila por día — con una constraint única detrás. La
-- secuencia real de Ernesto rompía de dos formas distintas:
--
--   Rinde 3 pedidos a las 20:00 -> la cajera confirma -> rinde 2 más a las
--   22:00  =>  EXCEPCIÓN "La liquidación de efectivo de ese día ya está
--   cerrada".
--
--   Y si la cajera NO confirma, la segunda rendición SOBRESCRIBÍA la fila:
--   `delivered_amount` pasaba a ser solo el segundo importe y el rastro del
--   primer dinero entregado desaparecía.
--
-- CÓMO LO RESUELVE PRODUCCIÓN (Regla 0)
-- delivery.tindivo.com lo arregló en 20260422010000_cash_settlement_cycles:
-- quitó la constraint única, enlazó cada pedido con el ciclo que lo incluye, y
-- dejó `settlement_date` como dato informativo. La agrupación real no es la
-- fecha: es el conjunto de pedidos con `cash_settlement_id IS NULL`.
--
--   Un solo ciclo ABIERTO a la vez por (motorizado, negocio).
--   Rendir con un ciclo abierto  -> ACUMULA sobre él.
--   Rendir sin ciclo abierto     -> abre uno nuevo.
--   Confirmar (o resolver) cierra el ciclo.
--
-- DÓNDE VIVE LA LÓGICA
-- Prod la puso en el endpoint. Aquí se queda en la RPC: enlazar los pedidos y
-- actualizar el ciclo tienen que ocurrir en la MISMA transacción, o una caída
-- entre ambos pasos deja pedidos cobrados sin liquidación o al revés.
-- Portamos la semántica, no la ubicación.
--
-- UNA DIVERGENCIA DELIBERADA CON PROD: el acumulado se acota al día
-- Prod acumula sin límite de fecha porque tiene auto-confirmación a las 24h
-- como red. La migración 0112 la retira, así que sin este límite un ciclo que
-- nadie confirme acumularía indefinidamente y acabaría confirmándose una
-- semana de golpe — perdiendo la capacidad de aislar una diferencia a un día
-- concreto. Aquí: si el ciclo abierto es de una fecha anterior, NO se acumula;
-- se abre uno nuevo. El viejo queda abierto y hay que ir a buscarlo.
--
-- =============================================================================

-- ── 1. Esquema: fuera la unicidad por día ────────────────────────────────────

alter table public.cash_settlements
  drop constraint if exists cash_settlements_business_id_driver_id_settlement_date_key;

-- Reemplaza a la unicidad para los lookups del ciclo abierto.
create index if not exists cs_business_driver_date_idx
  on public.cash_settlements (business_id, driver_id, settlement_date desc);

-- ── 2. Enlace pedido -> ciclo ────────────────────────────────────────────────
-- Sin esto es imposible saber qué pedidos cubrió cada rendición ni cuáles
-- siguen sin rendir. `on delete set null` para no perder el pedido si alguna
-- vez se borra una liquidación.

alter table public.orders
  add column if not exists cash_settlement_id uuid
    references public.cash_settlements(id) on delete set null;

comment on column public.orders.cash_settlement_id is
  'Liquidación de efectivo que incluye este pedido. NULL = cobrado pero aún no rendido.';

-- Dos accesos distintos, dos índices parciales:
--   · "qué pedidos cubrió esta liquidación" -> lado NOT NULL
--   · "qué lleva el motorizado sin rendir"  -> lado NULL, que es la consulta
--     de la sección "Pendiente del motorizado" y la que usa la propia RPC.
create index if not exists orders_cash_settlement_idx
  on public.orders (cash_settlement_id)
  where cash_settlement_id is not null;

create index if not exists orders_cash_pending_idx
  on public.orders (business_id, driver_id)
  where cash_settlement_id is null and status = 'delivered';

-- ── 3. Backfill de los pedidos ya liquidados ─────────────────────────────────
-- Enlaza retroactivamente por la clave vieja (negocio + motorizado + fecha de
-- entrega), que es exactamente como agrupaba la versión anterior. Sin esto, un
-- pedido ya rendido volvería a aparecer como pendiente.

update public.orders o
   set cash_settlement_id = cs.id
  from public.cash_settlements cs
 where o.cash_settlement_id is null
   and o.status = 'delivered'
   and o.payment_real = 'paid_cash'
   and o.business_id = cs.business_id
   and o.driver_id = cs.driver_id
   and (o.delivered_at at time zone 'America/Lima')::date = cs.settlement_date;

-- ── 4. create_cash_settlement: ciclos ────────────────────────────────────────

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

revoke execute on function public.create_cash_settlement(uuid, uuid, date, numeric)
  from public, anon, authenticated;
grant execute on function public.create_cash_settlement(uuid, uuid, date, numeric)
  to service_role;
