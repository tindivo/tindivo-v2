-- =============================================================================
-- 0157 · El efectivo se entrega cliente por cliente, no en un bulto
-- =============================================================================
--
-- EL PROBLEMA
-- La unidad de rendición era el CICLO: `create_cash_settlement` agarraba todos
-- los pedidos sin rendir de un negocio, los metía en una fila, y el motorizado
-- TECLEABA un monto total. La cajera confirmaba (o disputaba) el bulto entero.
--
-- Eso no es lo que pasa en el local. El motorizado dice "de Lucía 30, de Martha
-- 30, confírmame eso" — nombra clientes, no totales. Y cuando algo no cuadra, la
-- conversación es sobre CUÁL pedido, no sobre una diferencia de S/ 8 flotando
-- sobre cinco pedidos.
--
-- QUÉ CAMBIA
-- Una fila de `cash_settlements` POR PEDIDO. `order_count` es siempre 1 y
-- `total_cash = delivered_amount = order_cash_owed(pedido)`. El modelo de datos
-- ya lo permitía desde 0111 (que quitó la unicidad por día y añadió
-- `orders.cash_settlement_id`); lo único que faltaba era que la escritura
-- dejara de agrupar.
--
-- NO SE TOCA NINGUNA TABLA. Ni una columna, ni un enum, ni un índice. Solo
-- funciones. Los `cash_settlements` que ya existen siguen siendo válidos: son
-- ciclos con `order_count > 1`, y las pantallas los leen igual.
--
-- TRES DEFECTOS QUE MUEREN CON EL BULTO
--
--   1. EL MONTO DEJA DE VENIR DEL CLIENTE. `create_cash_settlement` aceptaba
--      `p_delivered_amount` y lo guardaba sin compararlo NUNCA con el total que
--      ella misma acababa de calcular. Ahora el importe es el del pedido y no
--      hay nada que teclear. Lo mismo en la confirmación: `confirm_order_cash`
--      DERIVA el monto de la fila en vez de aceptarlo por parámetro.
--
--   2. DOBLE TAP DEJA DE INFLAR EL SALDO. El endpoint no era idempotente: un
--      segundo POST con red lenta acumulaba sobre el ciclo abierto y sumaba el
--      dinero otra vez. Ahora el enlace `orders.cash_settlement_id` ES la clave
--      de idempotencia: si el pedido ya está enlazado a un ciclo abierto, se
--      devuelve ese mismo ciclo sin escribir nada.
--
--   3. AÑADIR PEDIDOS YA NO PISA UNA DISPUTA ABIERTA. La acumulación admitía
--      ciclos en estado `disputed` y los devolvía a `pending_confirmation`,
--      dejando el reporte del admin huérfano y sin cerrar. Sin acumulación no
--      hay forma de tocar un ciclo ya declarado.
--
-- Y UNO MÁS: LA FECHA. La acumulación se acotaba a `settlement_date`, así que
-- rendir algo de ayer y algo de hoy abría dos ciclos y el de ayer se quedaba
-- descolgado. Aquí `settlement_date` sale del `delivered_at` DEL PEDIDO en hora
-- Lima — es la fecha en que ese dinero se cobró, que es la única que significa
-- algo — y ya no participa en ninguna decisión de agrupación.
--
-- LO QUE SIGUE IGUAL. `dispute_cash_settlement` y `resolve_cash_settlement` no
-- se tocan: operan sobre un `cash_settlements.id` y les da igual que la fila
-- cubra un pedido o cinco. La bandeja del admin y los `reports` siguen
-- funcionando, ahora con la diferencia atribuida a un cliente concreto.
--
-- Idempotente.
-- =============================================================================

-- ── 1. El motorizado entrega el efectivo de UN pedido ────────────────────────

create or replace function public.deliver_order_cash(
  p_driver_user_id uuid,
  p_order_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_order public.orders;
  v_owed numeric;
  v_date date;
  v_open_status public.cash_settlement_status;
  v_id uuid;
begin
  select id into v_driver_id from public.drivers where user_id = p_driver_user_id;
  if v_driver_id is null then
    raise exception 'Motorizado no encontrado' using errcode = 'P0001';
  end if;

  -- FOR UPDATE sobre el pedido: es lo que serializa dos taps simultáneos del
  -- mismo botón. El segundo espera, ve el `cash_settlement_id` ya escrito por el
  -- primero y sale por la rama idempotente de abajo.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_order.driver_id is distinct from v_driver_id then
    raise exception 'Ese pedido no es tuyo' using errcode = 'P0001';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'El pedido todavía no está entregado' using errcode = 'P0001';
  end if;

  v_owed := public.order_cash_owed(v_order);
  if v_owed is null or v_owed <= 0 then
    raise exception 'Ese pedido no lleva efectivo' using errcode = 'P0001';
  end if;

  -- IDEMPOTENCIA. Si el pedido ya está enlazado, no se escribe nada. Se devuelve
  -- el ciclo existente cuando sigue abierto —el caso del doble tap— y se corta
  -- con error solo si ya lo cerraron, que sí es un intento de rendir dos veces.
  if v_order.cash_settlement_id is not null then
    select status into v_open_status
      from public.cash_settlements where id = v_order.cash_settlement_id;
    if v_open_status in ('pending_confirmation', 'disputed') then
      return jsonb_build_object(
        'id', v_order.cash_settlement_id,
        'orderId', p_order_id,
        'amount', v_owed,
        'status', v_open_status,
        'alreadyDelivered', true
      );
    end if;
    raise exception 'El efectivo de ese pedido ya fue confirmado' using errcode = 'P0001';
  end if;

  -- La fecha del dinero es la de la ENTREGA al cliente, en hora Lima. El turno
  -- es nocturno: calcularla con `now()` en UTC —como hacía el legacy— empujaba
  -- al día siguiente todo lo cobrado después de las 19:00 hora Perú.
  v_date := (coalesce(v_order.delivered_at, now()) at time zone 'America/Lima')::date;

  insert into public.cash_settlements (
    business_id, driver_id, settlement_date, total_cash, order_count,
    status, delivered_amount, delivered_at_ts
  ) values (
    v_order.business_id, v_driver_id, v_date, v_owed, 1,
    'pending_confirmation', v_owed, now()
  ) returning id into v_id;

  -- En la MISMA transacción que el insert. Una caída entre ambos pasos dejaría
  -- un pedido cobrado sin liquidación o una liquidación sin pedido.
  update public.orders set cash_settlement_id = v_id where id = p_order_id;

  -- El payload lleva de qué cliente es: el push que le llega a la cajera dice
  -- "Lucía Vera · S/ 30", no un total anónimo.
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', v_id, 'CashDelivered', jsonb_build_object(
    'businessId', v_order.business_id,
    'driverId', v_driver_id,
    'orderId', p_order_id,
    'shortId', v_order.short_id,
    'customerName', v_order.customer_name,
    'amount', v_owed
  ));

  return jsonb_build_object(
    'id', v_id,
    'orderId', p_order_id,
    'amount', v_owed,
    'status', 'pending_confirmation',
    'alreadyDelivered', false
  );
end;
$$;

comment on function public.deliver_order_cash(uuid, uuid) is
  'El motorizado entrega el efectivo de UN pedido. Idempotente por orders.cash_settlement_id (0157).';

-- ── 2. El negocio confirma el efectivo de UN pedido ──────────────────────────
--
-- Sin `p_confirmed_amount`. `confirm_cash_settlement` lo aceptaba y la UI le
-- pasaba siempre `delivered_amount`, así que el parámetro no servía para nada
-- salvo para dejar abierta la puerta a que la pantalla mandara otro número. El
-- monto se deriva de la fila: si la cajera contó algo distinto, eso es una
-- DISPUTA, que es un camino aparte y con su reporte al admin.

create or replace function public.confirm_order_cash(
  p_settlement_id uuid,
  p_business_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cs public.cash_settlements;
  v_biz uuid;
begin
  select * into v_cs from public.cash_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'Liquidación no existe' using errcode = 'P0002';
  end if;

  select id into v_biz from public.businesses where user_id = p_business_user_id;
  if v_biz is null or v_biz <> v_cs.business_id then
    raise exception 'No autorizado' using errcode = 'P0001';
  end if;

  -- Ya confirmada: no es un error. Dos taps de la cajera, o el tap que llega
  -- después de que el realtime ya pintó el cambio, no deben mostrarle nada rojo.
  if v_cs.status <> 'pending_confirmation' then
    return jsonb_build_object('confirmed', false, 'status', v_cs.status);
  end if;

  update public.cash_settlements
     set status = 'confirmed',
         confirmed_amount = v_cs.delivered_amount,
         confirmed_at = now(),
         confirmed_by = p_business_user_id,
         updated_at = now()
   where id = p_settlement_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('cash_settlement', p_settlement_id, 'CashConfirmed', jsonb_build_object(
    'businessId', v_cs.business_id,
    'driverId', v_cs.driver_id,
    'amount', v_cs.delivered_amount
  ));

  return jsonb_build_object(
    'confirmed', true, 'status', 'confirmed', 'amount', v_cs.delivered_amount
  );
end;
$$;

comment on function public.confirm_order_cash(uuid, uuid) is
  'La cajera confirma el efectivo de una liquidación. El monto se DERIVA, no se recibe (0157).';

-- ── 3. Se retiran las dos funciones del bulto ────────────────────────────────
--
-- `create_cash_settlement` agrupaba y aceptaba un monto tecleado; con la entrega
-- por pedido no tiene sentido, y dejarla viva sería dejar un segundo camino de
-- escritura que puede volver a juntar en una fila lo que esta migración separa.
--
-- `confirm_cash_settlement` se va por lo mismo: aceptaba el importe por
-- parámetro. Su reemplazo lo deriva.

drop function if exists public.create_cash_settlement(uuid, uuid, date, numeric);
drop function if exists public.confirm_cash_settlement(uuid, uuid, numeric);

-- ── 4. Permisos ──────────────────────────────────────────────────────────────
-- Igual que el resto del área: solo `service_role`. Las escrituras entran por el
-- API, nunca desde el navegador. (En el legacy la RLS dejaba al motorizado hacer
-- UPDATE sobre `cash_settlements` y auto-confirmarse la entrega; aquí las
-- policies son solo de SELECT y esto lo mantiene así.)

revoke execute on function public.deliver_order_cash(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.confirm_order_cash(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.deliver_order_cash(uuid, uuid) to service_role;
grant execute on function public.confirm_order_cash(uuid, uuid) to service_role;
