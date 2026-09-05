-- ============================================================================
-- 0210 — El panel aprende a compararse consigo mismo
-- ============================================================================
--
-- La pantalla «Rendimiento» enseñaba cifras absolutas sin nada al lado. Un
-- número sin línea base no es información: «S/ 8,341» no dice si el mes fue
-- bueno. Esta función devuelve, de una sola llamada, lo que hacía falta para
-- que lo sea.
--
-- CUATRO COSAS QUE EL FRONTEND NO PODÍA CALCULAR SOLO, Y POR QUÉ VIVEN AQUÍ:
--
-- 1. EL PERIODO ANTERIOR. La comparación necesita una segunda ventana, del
--    mismo largo, pegada por detrás. Traerla al navegador serían dos consultas
--    y dos caminos para desincronizarse.
--
-- 2. NUEVOS vs. QUE VOLVIERON. «Recurrente» se calculaba contando teléfonos con
--    2+ pedidos DENTRO de la ventana. Con el rango por defecto en «hoy» eso
--    preguntaba «¿quién pidió dos veces la misma noche?», y la respuesta real
--    en producción era cero en 17 de 27 jornadas. La pregunta que importa —
--    ¿este cliente ya había pedido antes?— necesita el historial COMPLETO del
--    negocio, no la ventana. Eso no se baja al navegador.
--
-- 3. LA FACTURA DE TINDIVO SALE DE `business_charges`, NO DE `orders`.
--    El panel derivaba «Inversión en Tindivo» de la comisión por pedido y
--    mostraba solo eso. Pero lo que el negocio debe de verdad incluye también
--    el envío que cobró al cliente y tiene que entregar, y las devoluciones.
--    En prod al 2026-09-05: S/ 588.00 de comisión, S/ 771.50 de envío y
--    S/ 20.50 de devolución. El panel decía 588 mientras «Mi cuenta» cobraba
--    1,380 — dos pantallas, dos números, ambos rotulados como «lo que le pago
--    a Tindivo». Aquí se leen de la MISMA tabla que factura, así no pueden
--    discrepar.
--
-- 4. EL PATRÓN SEMANAL. «Tu mejor día del periodo» devolvía una fecha suelta,
--    que es ruido. El patrón está en el día de la SEMANA (en prod el sábado
--    factura el doble que el martes y su ticket es 55% mayor que el del lunes),
--    y para verlo hace falta más historia que la ventana elegida. Se calcula
--    siempre sobre las últimas 8 semanas y la UI lo rotula así: es una pregunta
--    distinta, con su propio plazo, no el filtro de arriba aplicado a medias.
--
-- LA JORNADA, NO EL DÍA DEL CALENDARIO. Todo agrupa por
-- `current_service_date` (Lima − 5h), que es el día operativo real: un pedido
-- de la 1am pertenece a la noche anterior, que es como lo cuenta la cajera.
--
-- Solo lectura. `service_role` la llama desde /business/reports.

create or replace function public.business_performance_metrics(
  p_business_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int;
  v_prev_start date;
  v_prev_end date;
  v_wk_start date;
  v_current jsonb;
  v_previous jsonb;
  v_bill jsonb;
  v_customers jsonb;
  v_daily jsonb;
  v_weekday jsonb;
begin
  if p_business_id is null or p_start is null or p_end is null then
    raise exception 'business_performance_metrics: argumentos obligatorios';
  end if;
  if p_end < p_start then
    raise exception 'business_performance_metrics: p_end anterior a p_start';
  end if;

  -- Ventana anterior: mismo largo, pegada por detrás. Un rango de 7 días
  -- (start..end inclusive) compara contra los 7 inmediatamente previos.
  v_days := (p_end - p_start) + 1;
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  -- El patrón semanal mira 8 semanas hacia atrás desde el fin del rango, no el
  -- rango: con 7 días habría UNA muestra por día de la semana y el «patrón»
  -- sería el azar de esa semana.
  v_wk_start := p_end - 55;

  -- ── Periodo actual ────────────────────────────────────────────────────────
  select jsonb_build_object(
    'revenue',      coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0),
    'delivered',    coalesce(count(*) filter (where o.status = 'delivered'), 0),
    'cancelled',    coalesce(count(*) filter (where o.status = 'cancelled'), 0),
    'deliveryFees', coalesce(round(sum(coalesce(o.delivery_fee_charged, o.delivery_fee))
                      filter (where o.status = 'delivered'), 2), 0),
    'ticket',       coalesce(round(
                      sum(o.order_amount) filter (where o.status = 'delivered')
                      / nullif(count(*) filter (where o.status = 'delivered'), 0), 2), 0)
  )
  into v_current
  from public.orders o
  where o.business_id = p_business_id
    and public.current_service_date(o.created_at) between p_start and p_end;

  -- ── Periodo anterior (solo lo que se compara) ─────────────────────────────
  select jsonb_build_object(
    'start',     to_char(v_prev_start, 'YYYY-MM-DD'),
    'end',       to_char(v_prev_end, 'YYYY-MM-DD'),
    'revenue',   coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0),
    'delivered', coalesce(count(*) filter (where o.status = 'delivered'), 0),
    'ticket',    coalesce(round(
                   sum(o.order_amount) filter (where o.status = 'delivered')
                   / nullif(count(*) filter (where o.status = 'delivered'), 0), 2), 0)
  )
  into v_previous
  from public.orders o
  where o.business_id = p_business_id
    and public.current_service_date(o.created_at) between v_prev_start and v_prev_end;

  -- ── La factura de Tindivo, leída de donde se factura ──────────────────────
  -- Sin filtrar por `status`: lo que se muestra es lo que el periodo GENERÓ,
  -- pagado o no. El saldo vivo lo lleva «Mi cuenta»; esto es el costo del mes.
  select jsonb_build_object(
    'commission',  coalesce(round(sum(c.amount) filter (where c.charge_type = 'commission'), 2), 0),
    'deliveryFee', coalesce(round(sum(c.amount) filter (where c.charge_type = 'delivery_fee'), 2), 0),
    'refund',      coalesce(round(sum(c.amount) filter (where c.charge_type = 'refund_charge'), 2), 0),
    'total',       coalesce(round(sum(c.amount), 2), 0)
  )
  into v_bill
  from public.business_charges c
  where c.business_id = p_business_id
    and public.current_service_date(c.created_at) between p_start and p_end;

  -- ── Clientes: nuevos vs. que ya habían pedido antes ───────────────────────
  -- «Nuevo» = su PRIMER pedido entregado a ESTE negocio cae dentro del rango.
  -- Por eso hace falta el historial entero, y por eso no se puede resolver en
  -- el navegador con las filas de la ventana.
  with primera as (
    select o.customer_phone as tel,
           min(public.current_service_date(o.created_at)) as primer_dia
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'delivered'
      and o.customer_phone is not null
      and btrim(o.customer_phone) <> ''
    group by o.customer_phone
  ),
  en_ventana as (
    select distinct o.customer_phone as tel
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'delivered'
      and o.customer_phone is not null
      and btrim(o.customer_phone) <> ''
      and public.current_service_date(o.created_at) between p_start and p_end
  )
  select jsonb_build_object(
    'total',     coalesce(count(*), 0),
    'new',       coalesce(count(*) filter (where pr.primer_dia >= p_start), 0),
    'returning', coalesce(count(*) filter (where pr.primer_dia <  p_start), 0)
  )
  into v_customers
  from en_ventana ev
  join primera pr on pr.tel = ev.tel;

  -- ── Serie diaria (con los días vacíos rellenos, para no mentir la línea) ──
  with dias as (
    select generate_series(p_start, p_end, interval '1 day')::date as d
  ),
  agg as (
    select public.current_service_date(o.created_at) as d,
           count(*) filter (where o.status = 'delivered')::int as pedidos,
           coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0) as revenue
    from public.orders o
    where o.business_id = p_business_id
      and public.current_service_date(o.created_at) between p_start and p_end
    group by 1
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'date',    to_char(dias.d, 'YYYY-MM-DD'),
             'orders',  coalesce(agg.pedidos, 0),
             'revenue', coalesce(agg.revenue, 0)
           ) order by dias.d
         ), '[]'::jsonb)
  into v_daily
  from dias left join agg on agg.d = dias.d;

  -- ── Patrón por día de la semana (8 semanas) ───────────────────────────────
  -- `dow`: 0 = domingo .. 6 = sábado, como extract(dow).
  with agg as (
    select extract(dow from public.current_service_date(o.created_at))::int as dow,
           count(*)::int as pedidos,
           coalesce(round(sum(o.order_amount), 2), 0) as revenue
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'delivered'
      and public.current_service_date(o.created_at) between v_wk_start and p_end
    group by 1
  ),
  todos as (select generate_series(0, 6) as dow)
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'dow',     todos.dow,
             'orders',  coalesce(agg.pedidos, 0),
             'revenue', coalesce(agg.revenue, 0),
             'ticket',  case when coalesce(agg.pedidos, 0) > 0
                             then round(agg.revenue / agg.pedidos, 2) else 0 end
           ) order by todos.dow
         ), '[]'::jsonb)
  into v_weekday
  from todos left join agg on agg.dow = todos.dow;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'start', to_char(p_start, 'YYYY-MM-DD'),
      'end',   to_char(p_end, 'YYYY-MM-DD'),
      'days',  v_days
    ),
    'current',   v_current,
    'previous',  v_previous,
    'bill',      v_bill,
    'customers', coalesce(v_customers, jsonb_build_object('total', 0, 'new', 0, 'returning', 0)),
    'daily',     v_daily,
    'weekday',   v_weekday,
    'weekdayWindow', jsonb_build_object(
      'start', to_char(v_wk_start, 'YYYY-MM-DD'),
      'end',   to_char(p_end, 'YYYY-MM-DD'),
      'weeks', 8
    )
  );
end;
$$;

comment on function public.business_performance_metrics(uuid, date, date) is
  'Métricas del panel Rendimiento: periodo + periodo anterior, factura real desde business_charges, nuevos vs. recurrentes contra el historial completo, serie diaria y patrón semanal de 8 semanas. Agrupa por jornada (current_service_date).';

-- `CREATE OR REPLACE` no conserva la ACL y los default privileges de Supabase
-- devuelven EXECUTE a PUBLIC en cuanto queda vacía (ver 0204). Se revoca de las
-- tres procedencias, no solo de PUBLIC.
revoke all on function public.business_performance_metrics(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.business_performance_metrics(uuid, date, date)
  to service_role;
