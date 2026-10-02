-- ============================================================================
-- 0243 — Tindivo Store: el resumen del experimento
-- ============================================================================
--
-- El experimento dura 14 días «desde la primera publicación» (PRD §1) y la
-- lista del admin enseña vistas y clics por artículo (PRD §6.1). Ninguna de las
-- dos cosas se podía calcular con la 0242:
--
--  · `published_at` NO se deriva de `created_at`: un borrador puede pasar días
--    sin publicarse, y el día 1 es el de la primera publicación real. Lo fija el
--    trigger al salir de borrador y nunca se vuelve a tocar (ocultar y volver a
--    publicar no reinicia el reloj).
--  · Las cuentas salen de `store_events` con funciones agregadoras, porque
--    PostgREST no agrupa. Service-only, como el resto: las lee la API del admin.
--
-- Backfill: los artículos que ya estén publicados toman `updated_at` como mejor
-- estimación. En la práctica no hay ninguno (la 0242 es de hoy) pero la
-- migración no debe asumirlo.
--
-- Idempotente.
-- ============================================================================

alter table public.store_products add column if not exists published_at timestamptz;

update public.store_products
   set published_at = updated_at
 where published_at is null and status <> 'draft';

-- La guardia de la 0242 con una línea más: fija published_at al salir de borrador.
create or replace function public.store_products_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $fn$
begin
  new.title := nullif(btrim(new.title), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'store_product_must_start_as_draft' using errcode = 'P0001';
    end if;
    new.sold_at := null;
    new.published_at := null;
    return new;
  end if;

  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'store_product_cannot_return_to_draft' using errcode = 'P0001';
  end if;

  if old.status = 'draft' and new.status <> 'draft' then
    if not exists (select 1 from public.store_product_images i where i.product_id = new.id) then
      raise exception 'store_product_needs_a_photo' using errcode = 'P0001';
    end if;
  end if;

  new.sold_at := case
    when new.status <> 'sold' then null
    when old.status = 'sold' then old.sold_at
    else now()
  end;

  -- published_at: se fija una vez, al publicar, y es inmutable (el reloj del
  -- experimento no se reinicia por ocultar y volver a publicar).
  new.published_at := coalesce(
    old.published_at,
    case when new.status <> 'draft' then now() end
  );

  if old.slug is not null then
    new.slug := old.slug;
  elsif new.status <> 'draft' then
    new.slug := public.store_make_slug(new.title, new.code);
  end if;

  new.code := old.code;
  return new;
end;
$fn$;

-- Vistas y clics a WhatsApp por artículo, para las filas de la lista del admin.
create or replace function public.store_event_counts()
  returns table (product_id uuid, views bigint, whatsapp_clicks bigint)
  language sql stable security definer set search_path = ''
as $fn$
  select e.product_id,
         count(*) filter (where e.type = 'view_product'),
         count(*) filter (where e.type = 'click_whatsapp')
    from public.store_events e
   where e.product_id is not null
     and e.type in ('view_product', 'click_whatsapp')
   group by e.product_id
$fn$;

-- Resumen del experimento (PRD §6.1, §9). «Visita» = una sesión en un día que
-- vio el listado o un artículo: mucha gente llega directo a un producto desde
-- un link, y esa visita cuenta igual aunque nunca pise /store.
create or replace function public.store_metrics()
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_start timestamptz;
  v_day int;
  v_result jsonb;
begin
  select min(published_at) into v_start from public.store_products;

  if v_start is null then
    return jsonb_build_object(
      'startedAt', null, 'day', 0, 'totalDays', 14,
      'published', 0, 'visits', 0, 'whatsappClicks', 0, 'sales', 0, 'amountSold', 0,
      'navOut', 0, 'byRef', '[]'::jsonb
    );
  end if;

  v_day := greatest(1, least(14, floor(extract(epoch from (now() - v_start)) / 86400)::int + 1));

  select jsonb_build_object(
    'startedAt', v_start,
    'day', v_day,
    'totalDays', 14,
    'published', (select count(*) from public.store_products where status <> 'draft'),
    'visits', (select count(distinct e.session_id || (e.created_at at time zone 'America/Lima')::date::text)
                 from public.store_events e
                where e.type in ('view_list', 'view_product') and e.created_at >= v_start),
    'whatsappClicks', (select count(*) from public.store_events e
                        where e.type = 'click_whatsapp' and e.created_at >= v_start),
    'sales', (select count(*) from public.store_products p where p.status = 'sold'),
    'amountSold', (select coalesce(sum(p.price), 0) from public.store_products p where p.status = 'sold'),
    'navOut', (select count(distinct e.session_id) from public.store_events e
                where e.type = 'nav_out' and e.created_at >= v_start),
    'byRef', (
      select coalesce(jsonb_agg(r order by r.visits desc), '[]'::jsonb) from (
        select coalesce(e.ref, 'directo') as ref,
               count(distinct e.session_id || (e.created_at at time zone 'America/Lima')::date::text)
                 filter (where e.type in ('view_list', 'view_product')) as visits,
               count(*) filter (where e.type = 'click_whatsapp') as "whatsappClicks"
          from public.store_events e
         where e.created_at >= v_start
         group by coalesce(e.ref, 'directo')
      ) r
    )
  ) into v_result;

  return v_result;
end;
$fn$;

revoke execute on function public.store_event_counts() from public, anon, authenticated;
revoke execute on function public.store_metrics() from public, anon, authenticated;
grant execute on function public.store_event_counts() to service_role;
grant execute on function public.store_metrics() to service_role;
