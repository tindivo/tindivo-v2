-- ============================================================================
-- 0222 — El panel aprende a ponerse una meta
-- ============================================================================
--
-- La 0210 le dio al panel una línea base: el periodo anterior. Sirvió, pero
-- deja tres agujeros que se ven al correr la función contra prod (2026-09-07):
--
-- 1. COMPARA NOCHES CONTRA NOCHES DISTINTAS. El rango por defecto llegaba
--    hasta HOY, y los locales de San Jacinto abren de noche: a las 4 de la
--    tarde la jornada en curso está vacía por definición. Pizza Priamo hizo 73
--    pedidos en 6 noches (12.2/noche) contra 77 en 7 (11.0/noche) — subió 11%
--    por noche — y el panel le pintaba una flecha roja de −3.3%. El sesgo es
--    estructural, no del negocio: siempre −1/N.
--    Se arregla en dos sitios. El rango deja de incluir la jornada en curso
--    (eso vive en el frontend, `date-utils`), y aquí se devuelven las NOCHES
--    de cada ventana para poder dividir. `ordersPerNight` es además la cifra
--    en la que piensa un dueño de restaurante: «cuántos pedidos me entran por
--    noche», no «cuánto facturé en una ventana de siete días».
--
--    NOCHE = JORNADA CON AL MENOS UN PEDIDO ENTREGADO, no la declaración de
--    `business_service_days`. Esa tabla dice lo que el negocio DECLARÓ, y en
--    prod se contradice con los hechos: La Florencia figura `closed` el
--    2026-09-02 y el 2026-09-04 y entregó 5 y 8 pedidos esas noches (Priamo
--    igual el 08-31 y el 09-02). Un pedido entregado prueba que se trabajó;
--    una fila de declaración, no. Para normalizar hace falta lo primero.
--
-- 2. NO HAY META, SOLO ESPEJO RETROVISOR. Todo se medía contra el periodo
--    anterior, así que superar una semana mala se leía como éxito y el negocio
--    no tenía a dónde apuntar. Se devuelven dos anclas:
--      · `record`  — la mejor racha propia del MISMO largo que el rango, y la
--                    mejor noche suelta. Es la meta que no ofende a nadie:
--                    sale de su propia historia y ya demostró ser alcanzable.
--      · `town`    — la MEDIANA del pueblo en pedidos y venta por noche.
--                    Mediana y no promedio a propósito: con Priamo a 13
--                    pedidos/noche y el resto entre 1 y 5, el promedio (5.4)
--                    no describe a ningún local real; la mediana (3.9) sí.
--                    Va agregada y sin nombres — es una referencia, no un
--                    ranking, y nadie tiene por qué ver la caja del vecino.
--
-- 3. EL PEQUEÑO SE QUEDA MUDO. Los umbrales de `buildInsights` (20 pedidos
--    para el patrón semanal, 15 clientes para retención) callan justo al que
--    peor va: Al Punto veía UNA frase, «Facturaste 68.3% menos». Con `nights`
--    y `record` en el payload, `core` puede hablarle con muestra chica de lo
--    único que de verdad explica su caso: trabajó 2 de las 7 noches.
--
-- LA JORNADA EN CURSO SE DEVUELVE APARTE (`tonight`). Sacarla del rango no
-- puede significar que el dueño deje de verla: es lo que más mira. Pero es una
-- noche a medias y no se puede promediar con las cerradas sin volver a meter
-- el sesgo del punto 1.
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
  v_today date;
  v_current jsonb;
  v_previous jsonb;
  v_bill jsonb;
  v_customers jsonb;
  v_daily jsonb;
  v_weekday jsonb;
  v_tonight jsonb;
  v_record jsonb;
  v_town jsonb;
begin
  if p_business_id is null or p_start is null or p_end is null then
    raise exception 'business_performance_metrics: argumentos obligatorios';
  end if;
  if p_end < p_start then
    raise exception 'business_performance_metrics: p_end anterior a p_start';
  end if;

  v_days := (p_end - p_start) + 1;
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);
  v_wk_start := p_end - 55;
  v_today := public.current_service_date(now());

  -- ── Periodo actual ────────────────────────────────────────────────────────
  -- `nights` cuenta jornadas DISTINTAS con venta, no filas: es el divisor que
  -- hace comparables dos ventanas que no trabajaron los mismos días.
  select jsonb_build_object(
    'revenue',      coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0),
    'delivered',    coalesce(count(*) filter (where o.status = 'delivered'), 0),
    'cancelled',    coalesce(count(*) filter (where o.status = 'cancelled'), 0),
    'deliveryFees', coalesce(round(sum(coalesce(o.delivery_fee_charged, o.delivery_fee))
                      filter (where o.status = 'delivered'), 2), 0),
    'ticket',       coalesce(round(
                      sum(o.order_amount) filter (where o.status = 'delivered')
                      / nullif(count(*) filter (where o.status = 'delivered'), 0), 2), 0),
    'nights',       coalesce(count(distinct public.current_service_date(o.created_at))
                      filter (where o.status = 'delivered'), 0)
  )
  into v_current
  from public.orders o
  where o.business_id = p_business_id
    and public.current_service_date(o.created_at) between p_start and p_end;

  -- ── Periodo anterior ──────────────────────────────────────────────────────
  select jsonb_build_object(
    'start',     to_char(v_prev_start, 'YYYY-MM-DD'),
    'end',       to_char(v_prev_end, 'YYYY-MM-DD'),
    'revenue',   coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0),
    'delivered', coalesce(count(*) filter (where o.status = 'delivered'), 0),
    'ticket',    coalesce(round(
                   sum(o.order_amount) filter (where o.status = 'delivered')
                   / nullif(count(*) filter (where o.status = 'delivered'), 0), 2), 0),
    'nights',    coalesce(count(distinct public.current_service_date(o.created_at))
                   filter (where o.status = 'delivered'), 0)
  )
  into v_previous
  from public.orders o
  where o.business_id = p_business_id
    and public.current_service_date(o.created_at) between v_prev_start and v_prev_end;

  -- ── La factura de Tindivo, leída de donde se factura ──────────────────────
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

  -- ── Serie diaria ──────────────────────────────────────────────────────────
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

  -- ── La jornada en curso, aparte del rango ─────────────────────────────────
  -- `inRange` le dice a la UI si esta noche ya está contada arriba, para no
  -- enseñar el mismo pedido dos veces cuando el dueño elige a mano un rango
  -- que la incluye.
  select jsonb_build_object(
    'date',    to_char(v_today, 'YYYY-MM-DD'),
    'orders',  coalesce(count(*) filter (where o.status = 'delivered'), 0),
    'revenue', coalesce(round(sum(o.order_amount) filter (where o.status = 'delivered'), 2), 0),
    'active',  coalesce(count(*) filter (where o.status not in ('delivered', 'cancelled')), 0),
    'inRange', (v_today between p_start and p_end)
  )
  into v_tonight
  from public.orders o
  where o.business_id = p_business_id
    and public.current_service_date(o.created_at) = v_today;

  -- ── El récord propio: la meta que ya demostró ser alcanzable ──────────────
  --
  -- La mejor racha se mide del MISMO largo que el rango elegido; si no, la meta
  -- no sería comparable con la cifra que tiene al lado. Se recorren como mucho
  -- 365 días de historia: con la ventana más larga que ofrece la UI son unas
  -- once mil filas de join, nada.
  --
  -- LA VENTANA TIENE QUE TERMINAR ANTES DEL PERIODO QUE SE MIRA. Sin esa
  -- condición la mejor racha puede ser el propio periodo, y entonces la meta se
  -- muerde la cola: al local más grande de prod le salía «91 / 91, tu mejor
  -- marca era 91 (del 31/08 al 06/09)» — o sea, su récord es esta misma semana
  -- que tiene delante. La barra marcaba 100% siempre y la felicitación no
  -- significaba nada. Comparando solo contra el pasado, el mismo dato dice algo
  -- verdadero y que se puede celebrar: su mejor semana anterior fueron 87
  -- pedidos (15 al 21 de agosto) y esta hizo 91, así que batió su récord.
  --
  -- Solo cuentan las ventanas que caben ENTERAS dentro de la historia del
  -- negocio. Un local con diez días de vida no tiene «mejor mes», y rellenar
  -- con ceros los días anteriores a su alta le inventaría un récord bajísimo
  -- que batiría sin hacer nada. Cuando no hay ninguna ventana pasada completa,
  -- `window` vuelve `null` y la UI enseña «todavía sin marca que batir».
  with historia as (
    select public.current_service_date(o.created_at) as j,
           count(*)::int as ped,
           coalesce(round(sum(o.order_amount), 2), 0) as rev
    from public.orders o
    where o.business_id = p_business_id
      and o.status = 'delivered'
      and public.current_service_date(o.created_at) >= p_end - 364
    group by 1
  ),
  limites as (select min(j) as desde from historia),
  finales as (
    select gs::date as fin
    from limites,
         generate_series(limites.desde + (v_days - 1), p_start - 1, interval '1 day') gs
    where limites.desde is not null
  ),
  ventanas as (
    select f.fin,
           coalesce(sum(h.ped), 0)::int as ped,
           coalesce(sum(h.rev), 0) as rev
    from finales f
    left join historia h on h.j between f.fin - (v_days - 1) and f.fin
    group by f.fin
  ),
  mejor_ventana as (
    select fin, ped, rev from ventanas order by ped desc, rev desc, fin desc limit 1
  ),
  mejor_noche as (
    select j, ped, rev from historia order by ped desc, rev desc, j desc limit 1
  )
  select jsonb_build_object(
    'window', (select case when mv.ped > 0 then jsonb_build_object(
                 'start',   to_char(mv.fin - (v_days - 1), 'YYYY-MM-DD'),
                 'end',     to_char(mv.fin, 'YYYY-MM-DD'),
                 'orders',  mv.ped,
                 'revenue', mv.rev,
                 'days',    v_days
               ) end from mejor_ventana mv),
    'night',  (select case when mn.ped > 0 then jsonb_build_object(
                 'date',    to_char(mn.j, 'YYYY-MM-DD'),
                 'orders',  mn.ped,
                 'revenue', mn.rev
               ) end from mejor_noche mn)
  )
  into v_record;

  -- ── La referencia del pueblo, agregada y sin nombres ──────────────────────
  --
  -- MEDIANA, NO PROMEDIO. En prod (31/08 al 06/09) las tasas por noche son
  -- 13.0, 5.0, 2.8 y 1.0: el promedio (5.4) no describe a ningún local que
  -- exista, la mediana (3.9) sí. Con un local dominante el promedio convierte
  -- la referencia en «cómo te va contra el más grande», que es justo lo que no
  -- se quiere enseñar.
  --
  -- Se incluye al propio negocio en el cálculo. Excluirlo daría una referencia
  -- distinta para cada uno («los OTROS tres»), y con cuatro locales eso es casi
  -- señalar con el dedo; incluirse es un dato del pueblo, igual para todos.
  --
  -- `businesses` viaja para que la UI pueda callarse: con menos de tres locales
  -- con actividad la mediana no es una referencia, es el vecino.
  with noches as (
    select o.business_id as bid,
           public.current_service_date(o.created_at) as j,
           count(*)::int as ped,
           coalesce(sum(o.order_amount), 0) as rev
    from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.status = 'delivered'
      and b.is_active
      and not b.is_blocked
      and public.current_service_date(o.created_at) between p_start and p_end
    group by 1, 2
  ),
  tasas as (
    select bid,
           round(sum(ped)::numeric / count(*), 2) as ped_noche,
           round(sum(rev) / count(*), 2) as rev_noche,
           round(sum(rev) / nullif(sum(ped), 0), 2) as ticket
    from noches group by bid
  )
  select jsonb_build_object(
    'businesses',      coalesce(count(*), 0),
    'ordersPerNight',  coalesce(round(percentile_cont(0.5) within group (order by ped_noche)::numeric, 2), 0),
    'revenuePerNight', coalesce(round(percentile_cont(0.5) within group (order by rev_noche)::numeric, 2), 0),
    'ticket',          coalesce(round(percentile_cont(0.5) within group (order by ticket)::numeric, 2), 0)
  )
  into v_town
  from tasas;

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
    ),
    'tonight',   v_tonight,
    'record',    coalesce(v_record, jsonb_build_object('window', null, 'night', null)),
    'town',      coalesce(v_town, jsonb_build_object(
                   'businesses', 0, 'ordersPerNight', 0, 'revenuePerNight', 0, 'ticket', 0))
  );
end;
$$;

comment on function public.business_performance_metrics(uuid, date, date) is
  'Métricas del panel Rendimiento: periodo + periodo anterior (ambos con sus NOCHES trabajadas, para poder normalizar), factura real desde business_charges, nuevos vs. recurrentes contra el historial completo, serie diaria, patrón semanal de 8 semanas, la jornada en curso aparte, el récord propio del mismo largo que el rango y la mediana del pueblo. Agrupa por jornada (current_service_date).';

-- `CREATE OR REPLACE` no conserva la ACL y los default privileges de Supabase
-- devuelven EXECUTE a PUBLIC en cuanto queda vacía (ver 0204). Se revoca de las
-- tres procedencias, no solo de PUBLIC.
revoke all on function public.business_performance_metrics(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.business_performance_metrics(uuid, date, date)
  to service_role;
