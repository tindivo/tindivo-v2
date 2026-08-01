-- =============================================================================
-- 0116 - admin_metrics: desglose de payment_real y embudo del primer pedido
-- =============================================================================
--
-- PARA QUE
-- La regla "tu primer pedido va prepago" (`create_customer_order`, 0057) puede
-- ser el mayor freno de adopcion del B2C: en un pueblo donde manda el efectivo,
-- pedirle a un desconocido que yapee por adelantado es un punto de abandono.
-- `payment_real` se captura bien desde 4.7.4 (los prepagos ya registran
-- `paid_prepaid` y no `paid_yape`), pero solo se podia consultar por SQL. Sin
-- verlo, esa regla se decide a ciegas.
--
-- QUE ANADE (dos claves nuevas, nada mas)
--   - `byPaymentReal`  conteo por metodo sobre los pedidos ENTREGADOS del
--     rango. Sin filas para los metodos sin pedidos: no se pintan ceros.
--   - `prepayFunnel`   intentos de primer pedido prepago y en que acabaron.
--
-- QUE NO TOCA
-- Ni un calculo de dinero. Generada desde el `pg_get_functiondef` de la funcion
-- viva con `scratch/build-0116.py`: las cinco lineas que suman GMV, comision,
-- efectivo y ticket promedio estan aserted como intactas ANTES y DESPUES de las
-- sustituciones. Es una funcion de lectura (`STABLE`) y no escribe en ninguna
-- tabla. El cuerpo no se escribio a mano.
--
-- LO QUE ESTE EMBUDO NO MIDE (importante al leerlo)
-- Solo ve a quien llego a CREAR el pedido. Si el cliente abre el checkout, lee
-- "en tu primer pedido el pago es adelantado" y cierra la app, no queda ninguna
-- fila en la base: `order_event_log.order_id` es NOT NULL con FK a `orders`, asi
-- que un abandono sin pedido no tiene donde registrarse. Ese hueco es
-- probablemente el mas grande de los dos y hoy no hay telemetria que lo capture.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_metrics(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kpis jsonb; v_monitor jsonb; v_by_biz jsonb; v_by_drv jsonb; v_by_cancel jsonb; v_series jsonb;
  v_total int; v_delivered int; v_cancelled int; v_timeouts int;
  v_gmv numeric; v_commission numeric; v_avg_min numeric; v_cash numeric;
  v_unit text;
  v_by_payment jsonb; v_prepay jsonb;
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


  -- Desglose de payment_real sobre lo ENTREGADO.
  -- `group by` deja fuera los metodos sin ningun pedido en el rango: no se
  -- pintan ceros. El universo es `delivered` porque payment_real solo se fija
  -- al entregar (advance_order, accion 'deliver').
  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'count', c) order by c desc), '[]'::jsonb)
  into v_by_payment from (
    select payment_real::text as method, count(*) c
    from public.orders
    where status = 'delivered' and payment_real is not null
      and created_at >= p_from and created_at < p_to
    group by payment_real
  ) z;

  -- Embudo del primer pedido (la regla de 0057).
  -- "Cliente nuevo" se reconstruye con la MISMA definicion que usa el guard:
  -- cero pedidos `delivered` ANTES de crear este. El `delivered_at < created_at`
  -- es lo que lo evalua en el instante del intento y no a dia de hoy; sin eso,
  -- un cliente que ya recibio su segundo pedido dejaria de contar como nuevo
  -- retroactivamente y el embudo se encogeria solo.
  --
  -- Dos denominadores a proposito: `attempts` son pedidos y `customers` son
  -- personas. Un mismo cliente puede intentar, caerse y volver a intentar; para
  -- decidir si la regla frena la adopcion importa la persona, asi que
  -- `conversionPct` va sobre clientes. Los cubos de fallo van por pedido, que
  -- es donde vive `cancel_reason`.
  --
  -- `inProgress` son intentos aun vivos: cuentan en el denominador y todavia no
  -- en el numerador, asi que en un rango corto la conversion sale pesimista.
  with primer_intento as (
    select o.customer_user_id, o.status, o.cancel_reason
    from public.orders o
    where o.payment_intent = 'prepaid'
      and o.customer_user_id is not null
      and o.created_at >= p_from and o.created_at < p_to
      and not exists (
        select 1 from public.orders p
        where p.customer_user_id = o.customer_user_id
          and p.status = 'delivered'
          and p.delivered_at is not null
          and p.delivered_at < o.created_at
      )
  )
  select jsonb_build_object(
    'attempts', count(*),
    'customers', count(distinct customer_user_id),
    'customersConverted', count(distinct customer_user_id) filter (where status = 'delivered'),
    'delivered', count(*) filter (where status = 'delivered'),
    'prepayTimeout', count(*) filter (where status = 'cancelled' and cancel_reason = 'prepay_timeout'),
    'validationTimeout', count(*) filter (where status = 'cancelled' and cancel_reason = 'validation_timeout'),
    'proofRejected', count(*) filter (where status = 'cancelled' and cancel_reason = 'proof_rejected_final'),
    'otherCancelled', count(*) filter (where status = 'cancelled' and (cancel_reason is null
      or cancel_reason not in ('prepay_timeout', 'validation_timeout', 'proof_rejected_final'))),
    'inProgress', count(*) filter (where status not in ('delivered', 'cancelled')),
    'conversionPct', case when count(distinct customer_user_id) > 0
      then round(100.0 * count(distinct customer_user_id) filter (where status = 'delivered')
                 / count(distinct customer_user_id))
      else 0 end
  ) into v_prepay from primer_intento;

  if (p_to - p_from) <= interval '2 days' then v_unit := 'hour'; else v_unit := 'day'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(g.b, case when v_unit = 'hour' then 'YYYY-MM-DD"T"HH24:00' else 'YYYY-MM-DD' end),
    'gmv', coalesce(s.gmv, 0), 'commission', coalesce(s.commission, 0),
    'orders', coalesce(s.orders, 0), 'cancelled', coalesce(s.cancelled, 0)
  ) order by g.b), '[]'::jsonb) into v_series
  from generate_series(
    date_trunc(v_unit, (p_from at time zone 'America/Lima')),
    date_trunc(v_unit, ((p_to - interval '1 microsecond') at time zone 'America/Lima')),
    ('1 ' || v_unit)::interval
  ) g(b)
  left join (
    select date_trunc(v_unit, (created_at at time zone 'America/Lima')) bkt,
      coalesce(sum(order_amount) filter (where status = 'delivered'), 0) gmv,
      coalesce(sum(tindivo_commission) filter (where status = 'delivered'), 0) commission,
      count(*) orders,
      count(*) filter (where status = 'cancelled') cancelled
    from public.orders
    where created_at >= p_from and created_at < p_to
    group by 1
  ) s on s.bkt = g.b;

  return jsonb_build_object('kpis', v_kpis, 'monitor', v_monitor,
    'byBusiness', v_by_biz, 'byDriver', v_by_drv, 'byCancelReason', v_by_cancel,
    'series', v_series,
    'byPaymentReal', v_by_payment, 'prepayFunnel', v_prepay);
end;
$function$;
