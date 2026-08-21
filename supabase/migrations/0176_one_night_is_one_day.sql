-- =============================================================================
-- 0176 · Una noche es un día: la jornada como definición única
--
-- Idempotente. Rollback en supabase/rollbacks/0176_one_night_is_one_day.rollback.sql
-- =============================================================================
--
-- EL PROBLEMA
-- La 0154 creó `current_service_date()` —la jornada operativa, que empieza a las
-- 05:00 de Lima para que la madrugada cuente como el día anterior— y explicó por
-- qué hace falta: "Un negocio que cierra a la 1 de la madrugada sigue en la
-- jornada del día anterior: si usáramos la fecha natural, a las 00:00 le
-- saltaría otra vez el '¿abren hoy?' en plena faena".
--
-- Y NADIE LA USA fuera de la propia 0154. Todo lo demás decide "qué día es" con
-- la fecha de calendario, o sea `(delivered_at at time zone 'America/Lima')::date`.
-- Con el servicio yendo de ~18:00 a ~01:00, eso parte cada noche en dos.
--
-- POR QUÉ AHORA, SI HOY NO FALLA
-- Hoy no falla, y conviene ser exacto sobre eso: ningún turno configurado cruza
-- medianoche (Florencia y Priamo cierran 23:00, Nadia 22:00, `crosses_midnight`
-- es false en las 20 filas de horario), la entrega más tardía registrada es a
-- las 23:xx, y CERO de las 44 liquidaciones tienen `settlement_date` distinto de
-- su jornada.
--
-- Justamente por eso. El backfill de abajo mueve 0 filas hoy; el día que un
-- negocio configure un cierre a las 00:30 —que el esquema soporta a propósito—
-- movería dinero ya liquidado. La ventana para hacer esto gratis es ahora.
--
-- LO QUE NO SE TOCA
--   · El backfill histórico de la 0111 (línea 91). Es historia, ya corrió.
--   · `create_cash_settlement` (0018/0111), que agrupaba por `settlement_date`
--     con el cast natural: **ya no existe**. La 0157 la borró (`drop function`,
--     línea 228) al pasar a una liquidación por pedido. No queda nada que
--     arreglar ahí, y conviene saberlo: es fácil leer su código en la 0111 y
--     creer que sigue vivo.
-- =============================================================================

-- ── 1. deliver_order_cash: la fecha del dinero es la JORNADA ─────────────────
--
-- Única diferencia con la versión de la 0157: la línea de `v_date`. El resto del
-- cuerpo se reproduce tal cual, que es lo que exige `create or replace`.

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

  -- 0176 · LA JORNADA, NO LA FECHA DE CALENDARIO.
  --
  -- Antes se casteaba `delivered_at` a la fecha natural de Lima. (El cast no se
  -- reproduce aquí ni siquiera como comentario: el guard del final busca esa
  -- cadena en `pg_get_functiondef`, que incluye los comentarios, y escribirla
  -- haría fallar la migración por su propia explicación.)
  --
  -- La 0157 ya había arreglado la mitad del problema —calcularla en UTC empujaba
  -- al día siguiente todo lo cobrado después de las 19:00 hora Perú— pero se
  -- quedó en la fecha natural, que parte la noche a las 00:00.
  --
  -- Con esto, todo lo cobrado en una misma noche comparte `settlement_date`
  -- aunque parte se entregue después de medianoche. Es la diferencia entre "el
  -- corte de Ernesto del martes" siendo una fila o dos.
  v_date := public.current_service_date(coalesce(v_order.delivered_at, now()));

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
  'El motorizado entrega el efectivo de UN pedido. Idempotente por orders.cash_settlement_id (0157). settlement_date es la JORNADA, no la fecha natural (0176).';

revoke execute on function public.deliver_order_cash(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.deliver_order_cash(uuid, uuid) to service_role;

-- ── 2. generate_settlements: el período también cuenta por jornada ───────────
--
-- Es la factura de comisiones negocio -> Tindivo. El admin elige un rango de
-- fechas; con el cast natural, un pedido entregado a las 00:30 del primer día
-- del período entraba y uno de las 00:30 del día siguiente al último se
-- quedaba fuera — partiendo noches entre dos facturas.
--
-- Hoy no la llama ninguna pantalla, así que el cambio es preventivo. Se hace
-- ahora por lo mismo que el resto: cuando se cablee, ya estará de acuerdo con
-- todos los demás.

create or replace function public.generate_settlements(
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_created_by uuid default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_period_end < p_period_start then
    raise exception 'Período inválido' using errcode = 'P0001';
  end if;

  insert into public.settlements (
    business_id, period_start, period_end, order_count, total_amount, due_date, created_by, status
  )
  select
    o.business_id, p_period_start, p_period_end,
    count(*), sum(o.tindivo_commission), p_due_date, p_created_by, 'pending'
  from public.orders o
  where o.status = 'delivered'
    -- 0176 · jornada, no fecha natural. Ver cabecera.
    and public.current_service_date(o.delivered_at) between p_period_start and p_period_end
    and o.tindivo_commission is not null
  group by o.business_id
  having sum(o.tindivo_commission) > 0
  on conflict (business_id, period_start, period_end) do nothing;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'businessId', business_id, 'orderCount', order_count,
      'totalAmount', total_amount, 'status', status, 'dueDate', due_date
    ) order by total_amount desc), '[]'::jsonb)
    from public.settlements
    where period_start = p_period_start and period_end = p_period_end
  );
end;
$$;

comment on function public.generate_settlements(date, date, date, uuid) is
  'Factura de comisiones del período por negocio. El período se cuenta por JORNADA (0176), no por fecha natural.';

revoke execute on function public.generate_settlements(date, date, date, uuid)
  from public, anon, authenticated;
grant execute on function public.generate_settlements(date, date, date, uuid) to service_role;

-- ── 3. Backfill: las liquidaciones ya escritas ───────────────────────────────
--
-- Hoy mueve CERO filas y eso está comprobado antes de escribir esto. Va igual,
-- porque una migración que solo funciona si se aplica el mismo día que se
-- escribe no es una migración. Si en el hueco entre escribirla y aplicarla
-- entrara una entrega de madrugada, esto la coloca en su noche.
--
-- `min(...)`: desde la 0157 hay una liquidación por pedido, así que el agregado
-- recorre una sola fila. Se escribe agregado igualmente para que las filas
-- viejas de la época multi-pedido (0111) caigan en la jornada de su primera
-- entrega en vez de reventar el update.

update public.cash_settlements cs
   set settlement_date = j.jornada
  from (
    select o.cash_settlement_id as id,
           min(public.current_service_date(o.delivered_at)) as jornada
      from public.orders o
     where o.cash_settlement_id is not null
       and o.delivered_at is not null
     group by o.cash_settlement_id
  ) j
 where cs.id = j.id
   and cs.settlement_date is distinct from j.jornada;

-- ── Guards ───────────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
  v_pendientes int;
begin
  -- 4.1 · Las dos funciones vivas usan la jornada y ya no el cast natural.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'deliver_order_cash';

  if v_def not like '%current_service_date%' then
    raise exception '0176 abortada: deliver_order_cash no usa current_service_date' using errcode = 'P0001';
  end if;
  if v_def like '%at time zone ''America/Lima'')::date%' then
    raise exception '0176 abortada: deliver_order_cash conserva el cast de fecha natural' using errcode = 'P0001';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generate_settlements';

  if v_def not like '%current_service_date%' then
    raise exception '0176 abortada: generate_settlements no usa current_service_date' using errcode = 'P0001';
  end if;

  -- 4.2 · Ninguna liquidación enlazada se queda fuera de su jornada.
  --
  -- Se agrega con el MISMO `min(...)` que el backfill, y no fila a fila contra
  -- cada pedido. Una liquidación de la época multi-pedido (0111) puede cubrir
  -- pedidos de dos jornadas —las hay en local, porque los tests de efectivo
  -- llaman de verdad a `create_cash_settlement`— y comparándola contra cada uno
  -- de sus pedidos siempre habría al menos uno que no coincide: el guard
  -- abortaría una migración que hizo exactamente lo que debía.
  select count(*) into v_pendientes
    from public.cash_settlements cs
    join (
      select o.cash_settlement_id as id,
             min(public.current_service_date(o.delivered_at)) as jornada
        from public.orders o
       where o.cash_settlement_id is not null
         and o.delivered_at is not null
       group by o.cash_settlement_id
    ) j on j.id = cs.id
   where cs.settlement_date is distinct from j.jornada;

  if v_pendientes > 0 then
    raise exception '0176 abortada: quedan % liquidaciones fuera de su jornada', v_pendientes
      using errcode = 'P0001';
  end if;
end $$;
