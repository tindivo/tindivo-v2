-- 0192_monitoring_online_and_conversion.sql
-- Métricas de solo lectura para el panel de monitoreo de conversión y operación online.

-- 1. Pedidos online por jornada
create or replace function public.admin_online_orders_stats(
  p_from date default (public.current_service_date() - interval '13 days')::date,
  p_to date default public.current_service_date()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_series jsonb;
  v_totals jsonb;
begin
  -- Agregación por jornada operativa
  with daily as (
    select
      public.current_service_date(created_at) as jornada,
      count(*)::int as creados,
      count(*) filter (where status = 'delivered')::int as entregados,
      count(*) filter (where status = 'cancelled')::int as cancelados
    from public.orders
    where source = 'customer_pwa'
      and public.current_service_date(created_at) between p_from and p_to
    group by public.current_service_date(created_at)
    order by jornada asc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'jornada', to_char(jornada, 'YYYY-MM-DD'),
          'creados', creados,
          'entregados', entregados,
          'cancelados', cancelados,
          'tasa_entrega', case when creados > 0 then round((entregados::numeric / creados::numeric), 4) else 0 end
        )
      ),
      '[]'::jsonb
    )
  into v_series
  from daily;

  -- Totales del rango
  with overall as (
    select
      count(*)::int as creados,
      count(*) filter (where status = 'delivered')::int as entregados,
      count(*) filter (where status = 'cancelled')::int as cancelados
    from public.orders
    where source = 'customer_pwa'
      and public.current_service_date(created_at) between p_from and p_to
  )
  select
    jsonb_build_object(
      'creados', coalesce(creados, 0),
      'entregados', coalesce(entregados, 0),
      'cancelados', coalesce(cancelados, 0),
      'tasa_entrega', case when coalesce(creados, 0) > 0 then round((coalesce(entregados, 0)::numeric / creados::numeric), 4) else 0 end
    )
  into v_totals
  from overall;

  return jsonb_build_object(
    'from', to_char(p_from, 'YYYY-MM-DD'),
    'to', to_char(p_to, 'YYYY-MM-DD'),
    'series', v_series,
    'totals', v_totals
  );
end;
$$;

comment on function public.admin_online_orders_stats(date, date) is
  'Reporte de pedidos online por jornada operativa (current_service_date), de solo lectura.';

revoke all on function public.admin_online_orders_stats(date, date) from public, anon, authenticated;
grant execute on function public.admin_online_orders_stats(date, date) to service_role;


-- 2. Oportunidad de conversión (address_directory vs customer_profiles y pedidos v2)
create or replace function public.admin_conversion_opportunity_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total_directory int;
  v_with_account int;
  v_without_account int;
  v_profiles_without_phone int;
  v_segment_a int := 0;
  v_segment_b int := 0;
  v_segment_c int := 0;
  v_segment_d int := 0;
  v_by_business jsonb;
  v_actionable jsonb;
begin
  -- Conteo de perfiles registrados sin teléfono
  select count(*)::int
  into v_profiles_without_phone
  from public.customer_profiles
  where phone is null or length(regexp_replace(phone, '\D', '', 'g')) < 9;

  -- Tabla temporal con teléfonos únicos normalizados del directorio y su nombre más reciente
  with dir_unique as (
    select distinct on (right(regexp_replace(phone, '\D', '', 'g'), 9))
      right(regexp_replace(phone, '\D', '', 'g'), 9) as phone_norm,
      coalesce(nullif(trim(customer_name), ''), 'Cliente') as customer_name,
      last_used_at
    from public.address_directory
    where length(regexp_replace(phone, '\D', '', 'g')) >= 9
    order by right(regexp_replace(phone, '\D', '', 'g'), 9), last_used_at desc nulls last
  ),
  acc_unique as (
    select distinct right(regexp_replace(phone, '\D', '', 'g'), 9) as phone_norm
    from public.customer_profiles
    where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 9
  ),
  -- Pedidos manuales en v2 por teléfono
  v2_orders as (
    select
      o.id as order_id,
      o.business_id,
      b.name as business_name,
      right(regexp_replace(coalesce(o.customer_phone, ad.phone), '\D', '', 'g'), 9) as phone_norm
    from public.orders o
    left join public.address_directory ad on ad.id = o.address_directory_id
    left join public.businesses b on b.id = o.business_id
    where (o.source != 'customer_pwa' or o.is_manual is true)
      and (
        (o.customer_phone is not null and length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 9)
        or (ad.phone is not null and length(regexp_replace(ad.phone, '\D', '', 'g')) >= 9)
      )
  ),
  v2_phone_agg as (
    select
      phone_norm,
      count(order_id)::int as orders_count,
      array_agg(distinct business_name) filter (where business_name is not null) as businesses
    from v2_orders
    group by phone_norm
  ),
  -- Cruce del directorio contra cuentas y pedidos v2
  classified as (
    select
      d.phone_norm,
      d.customer_name,
      (a.phone_norm is not null) as has_account,
      coalesce(v.orders_count, 0) as v2_orders_count,
      coalesce(v.businesses, '{}'::text[]) as businesses,
      case
        when a.phone_norm is not null then 'CON_CUENTA'
        when coalesce(v.orders_count, 0) >= 5 then 'A'
        when coalesce(v.orders_count, 0) >= 2 then 'B'
        when coalesce(v.orders_count, 0) = 1 then 'C'
        else 'D'
      end as segment
    from dir_unique d
    left join acc_unique a on a.phone_norm = d.phone_norm
    left join v2_phone_agg v on v.phone_norm = d.phone_norm
  )
  select
    count(*)::int,
    count(*) filter (where has_account)::int,
    count(*) filter (where not has_account)::int,
    count(*) filter (where segment = 'A')::int,
    count(*) filter (where segment = 'B')::int,
    count(*) filter (where segment = 'C')::int,
    count(*) filter (where segment = 'D')::int
  into
    v_total_directory,
    v_with_account,
    v_without_account,
    v_segment_a,
    v_segment_b,
    v_segment_c,
    v_segment_d
  from classified;

  -- Desglose por negocio para clientes sin cuenta que han pedido en v2
  with dir_without_acc as (
    select distinct right(regexp_replace(phone, '\D', '', 'g'), 9) as phone_norm
    from public.address_directory
    where length(regexp_replace(phone, '\D', '', 'g')) >= 9
      and right(regexp_replace(phone, '\D', '', 'g'), 9) not in (
        select distinct right(regexp_replace(phone, '\D', '', 'g'), 9)
        from public.customer_profiles
        where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 9
      )
  ),
  v2_biz as (
    select
      b.id as business_id,
      b.name as business_name,
      b.accent_color,
      count(distinct o_phone.phone_norm)::int as contacts_count,
      count(o.id)::int as orders_count
    from public.businesses b
    join public.orders o on o.business_id = b.id
    left join public.address_directory ad on ad.id = o.address_directory_id
    cross join lateral (
      select right(regexp_replace(coalesce(o.customer_phone, ad.phone), '\D', '', 'g'), 9) as phone_norm
    ) o_phone
    join dir_without_acc dwa on dwa.phone_norm = o_phone.phone_norm
    where (o.source != 'customer_pwa' or o.is_manual is true)
    group by b.id, b.name, b.accent_color
    order by contacts_count desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'business_id', business_id,
        'name', business_name,
        'accent_color', accent_color,
        'contacts_count', contacts_count,
        'orders_count', orders_count
      )
    ),
    '[]'::jsonb
  )
  into v_by_business
  from v2_biz;

  -- Lista nominal accionable (Segmentos A y B)
  with dir_unique as (
    select distinct on (right(regexp_replace(phone, '\D', '', 'g'), 9))
      right(regexp_replace(phone, '\D', '', 'g'), 9) as phone_norm,
      coalesce(nullif(trim(customer_name), ''), 'Cliente') as customer_name
    from public.address_directory
    where length(regexp_replace(phone, '\D', '', 'g')) >= 9
    order by right(regexp_replace(phone, '\D', '', 'g'), 9), last_used_at desc nulls last
  ),
  acc_unique as (
    select distinct right(regexp_replace(phone, '\D', '', 'g'), 9) as phone_norm
    from public.customer_profiles
    where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 9
  ),
  v2_orders as (
    select
      o.id as order_id,
      b.name as business_name,
      right(regexp_replace(coalesce(o.customer_phone, ad.phone), '\D', '', 'g'), 9) as phone_norm
    from public.orders o
    left join public.address_directory ad on ad.id = o.address_directory_id
    left join public.businesses b on b.id = o.business_id
    where (o.source != 'customer_pwa' or o.is_manual is true)
  ),
  v2_phone_agg as (
    select
      phone_norm,
      count(order_id)::int as orders_count,
      array_agg(distinct business_name) filter (where business_name is not null) as businesses
    from v2_orders
    where phone_norm is not null
    group by phone_norm
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'phone', d.phone_norm,
        'customer_name', d.customer_name,
        'segment', case when v.orders_count >= 5 then 'A' else 'B' end,
        'orders_count', v.orders_count,
        'businesses', coalesce(v.businesses, '{}'::text[])
      )
      order by v.orders_count desc, d.phone_norm asc
    ),
    '[]'::jsonb
  )
  into v_actionable
  from dir_unique d
  join v2_phone_agg v on v.phone_norm = d.phone_norm
  left join acc_unique a on a.phone_norm = d.phone_norm
  where a.phone_norm is null
    and v.orders_count >= 2;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total_directory_phones', coalesce(v_total_directory, 0),
      'with_account', coalesce(v_with_account, 0),
      'without_account', coalesce(v_without_account, 0),
      'profiles_without_phone', coalesce(v_profiles_without_phone, 0)
    ),
    'segments', jsonb_build_object(
      'A', coalesce(v_segment_a, 0),
      'B', coalesce(v_segment_b, 0),
      'C', coalesce(v_segment_c, 0),
      'D', coalesce(v_segment_d, 0)
    ),
    'by_business', coalesce(v_by_business, '[]'::jsonb),
    'actionable_contacts', coalesce(v_actionable, '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_conversion_opportunity_stats() is
  'Métricas de oportunidad de conversión cruzando address_directory, customer_profiles y pedidos manuales v2.';

revoke all on function public.admin_conversion_opportunity_stats() from public, anon, authenticated;
grant execute on function public.admin_conversion_opportunity_stats() to service_role;
