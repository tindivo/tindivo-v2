-- ============================================================================
-- 0242 — Tindivo Store: el catálogo de artículos nuevos y de segunda
-- ============================================================================
--
-- QUÉ ES. La base de `/store`: un vendedor (Jesús), piezas únicas, sin carrito
-- ni pago en línea. El comprador mira, toca WhatsApp y todo se cierra por chat.
-- Spec: Docs/Store/tindivo-store-prd-v2.md (§4 modelo de datos).
--
-- DECISIONES QUE NO SALEN DEL PRD
--
--  · Nombres en inglés (convención del repo); el PRD los da en español.
--  · Los parámetros operativos (WhatsApp, delivery) viven en `app_settings`
--    bajo la clave `store`, no en una tabla nueva: CLAUDE.md prohíbe el
--    hardcode y `app_settings` ya es el sitio.
--  · La portada NO es una columna: es la foto de menor `position`. Una sola
--    fuente de verdad en lugar de `is_cover` + un invariante de "solo una".
--  · El slug se fija al PUBLICAR, no al crear el borrador. Un borrador no tiene
--    título todavía, y un slug que cambiara después de compartido rompería
--    los links que ya están en Facebook y WhatsApp.
--  · `delivered`-style terminalidad NO aplica: un vendido se puede revertir
--    (PRD §6.2). Lo que sí se protege es que nada vuelva a `draft` una vez
--    publicado, porque un borrador no se sirve y el link compartido moriría.
--  · Los invariantes (≤6 fotos, ≥1 para publicar, campos obligatorios,
--    `sold_at` coherente) están en la BASE y no solo en la API: el admin escribe
--    desde el celular con red mala y la API no puede ser la única guardia.
--  · La superficie pública es la API (como `search_catalog`): las RPC son
--    service-only y las tablas no tienen lectura anónima.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Categorías ───────────────────────────────────────────────────────────
create table if not exists public.store_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  icon       text not null,              -- nombre de Material Symbols
  sort_order smallint not null default 0,
  active     boolean not null default true
);
comment on table public.store_categories is
  'Categorías fijas de Tindivo Store. Las que no tienen artículos públicos no se muestran.';

insert into public.store_categories (name, slug, icon, sort_order) values
  ('Ropa',                  'ropa',      'checkroom',     1),
  ('Calzado',               'calzado',   'steps',         2),
  ('Bolsos y accesorios',   'bolsos',    'backpack',      3),
  ('Perfumes y belleza',    'perfumes',  'water_drop',    4),
  ('Tecnología',            'tecnologia','devices',       5),
  ('Hogar y plantas',       'hogar',     'potted_plant',  6),
  ('Deporte',               'deporte',   'sports_soccer', 7),
  ('Otros',                 'otros',     'category',      8)
on conflict (slug) do nothing;          -- no pisa un nombre o icono ya ajustado

-- ── 2. Productos ────────────────────────────────────────────────────────────
create sequence if not exists public.store_product_code_seq;

create table if not exists public.store_products (
  id              uuid primary key default gen_random_uuid(),
  -- TS-0001. Atómico desde la base (invariante 2 del repo: nunca Date.now()).
  code            text not null unique
                    default ('TS-' || lpad(nextval('public.store_product_code_seq')::text, 4, '0')),
  -- Null mientras es borrador; lo fija el trigger al publicar.
  slug            text unique,

  title           text check (title is null or length(title) <= 60),
  description     text check (description is null or length(description) <= 600),
  category_id     uuid references public.store_categories(id),
  audience        text check (audience in ('women', 'men', 'kids', 'unisex')),
  condition       text check (condition in ('new_with_tag', 'new_unused', 'used')),
  condition_score smallint check (condition_score between 1 and 10),
  size_label      text check (size_label is null or length(size_label) <= 20),

  price           numeric(10,2) check (price > 0),
  original_price  numeric(10,2) check (original_price > 0),
  is_clearance    boolean not null default false,
  negotiable      boolean not null default false,

  -- Punto central del recorte cuadrado de la portada, de 0 a 1.
  cover_focus_x   numeric(4,3) not null default 0.5 check (cover_focus_x between 0 and 1),
  cover_focus_y   numeric(4,3) not null default 0.5 check (cover_focus_y between 0 and 1),

  status          text not null default 'draft'
                    check (status in ('draft', 'available', 'reserved', 'sold', 'hidden')),
  sold_at         timestamptz,
  seller_id       uuid references public.users(id),   -- vacío en el MVP

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Lo que hace falta para que un artículo salga de borrador (PRD §6.3).
  -- `condition_score` solo se exige si es usado; en nuevo no tiene sentido.
  constraint store_products_publishable_chk check (
    status = 'draft'
    or (
      title is not null and length(btrim(title)) > 0
      and price is not null
      and category_id is not null
      and condition is not null
      and (condition <> 'used' or condition_score is not null)
    )
  )
);
comment on table public.store_products is
  'Artículo de Tindivo Store. Una fila = una pieza única (si hay dos iguales, se duplica).';
comment on column public.store_products.original_price is
  'Solo se muestra si es mayor que price (regla de la capa de lectura, no de la base).';

-- Listado público: filtra por estado y ordena por fecha. Parcial: los
-- borradores y ocultos no se sirven nunca, así que no entran en el índice.
create index if not exists store_products_public_idx
  on public.store_products (status, created_at desc)
  where status in ('available', 'reserved', 'sold');
create index if not exists store_products_category_idx
  on public.store_products (category_id) where category_id is not null;
-- «Tienes X borradores»: el admin lee los últimos tocados.
create index if not exists store_products_draft_idx
  on public.store_products (updated_at desc) where status = 'draft';

-- ── 3. Fotos ────────────────────────────────────────────────────────────────
create table if not exists public.store_product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.store_products(id) on delete cascade,
  url         text not null,             -- ~1080 px, el detalle y el visor
  thumb_url   text not null,             -- ~400 px, tarjetas de la grilla
  position    smallint not null check (position between 0 and 5),
  created_at  timestamptz not null default now(),
  -- Diferida para poder reordenar intercambiando posiciones en un solo UPDATE.
  constraint store_product_images_position_key
    unique (product_id, position) deferrable initially deferred
);
comment on table public.store_product_images is
  'Fotos del artículo, máximo 6. La de menor position es la portada.';

-- ── 4. Eventos del experimento ──────────────────────────────────────────────
create table if not exists public.store_events (
  id          bigint generated always as identity primary key,
  type        text not null check (type in (
                'view_list', 'view_product', 'search', 'filter_open', 'filter_apply',
                'click_whatsapp', 'click_notify', 'share', 'nav_out')),
  product_id  uuid references public.store_products(id) on delete set null,
  search_term text check (search_term is null or length(search_term) <= 80),
  ref         text check (ref is null or ref in ('fb', 'mp', 'wa_estado', 'grupo', 'tiktok')),
  session_id  text not null check (length(session_id) between 8 and 64),
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.store_events is
  'Embudo del experimento de 14 días. Sin datos personales: session_id es anónimo.';
-- Las métricas cuentan por tipo y ventana; el detalle por artículo.
create index if not exists store_events_type_idx on public.store_events (type, created_at desc);
create index if not exists store_events_product_idx
  on public.store_events (product_id, type) where product_id is not null;

-- ── 5. Parámetros operativos ────────────────────────────────────────────────
insert into public.app_settings (key, value)
values (
  'store',
  '{
    "whatsappNumber": "51906550166",
    "deliveryMin": 2.00,
    "deliveryMax": 2.50,
    "deliveryText": null
  }'::jsonb
)
on conflict (key) do nothing;           -- no pisa un ajuste hecho en vivo

-- ── 6. Slug ─────────────────────────────────────────────────────────────────
-- «Casaca jean M» + TS-0012 → casaca-jean-m-ts-0012. El código va siempre al
-- final: garantiza unicidad aunque dos títulos sean iguales.
create or replace function public.store_make_slug(p_title text, p_code text)
  returns text
  language sql immutable
  set search_path = ''
as $$
  select trim(both '-' from left(
           regexp_replace(public.f_unaccent(lower(coalesce(p_title, ''))), '[^a-z0-9]+', '-', 'g'),
           50))
         || '-' || lower(p_code)
$$;

-- ── 7. Guardia de escritura de productos ────────────────────────────────────
create or replace function public.store_products_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $fn$
begin
  new.title := nullif(btrim(new.title), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    -- Un artículo nace siempre como borrador: aún no tiene fotos.
    if new.status <> 'draft' then
      raise exception 'store_product_must_start_as_draft' using errcode = 'P0001';
    end if;
    new.sold_at := null;
    return new;
  end if;

  -- UPDATE
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'store_product_cannot_return_to_draft' using errcode = 'P0001';
  end if;

  -- Salir de borrador exige al menos una foto (PRD §6.3).
  if old.status = 'draft' and new.status <> 'draft' then
    if not exists (select 1 from public.store_product_images i where i.product_id = new.id) then
      raise exception 'store_product_needs_a_photo' using errcode = 'P0001';
    end if;
  end if;

  -- sold_at lo decide el estado y nadie más: se fija al pasar a vendido, se
  -- conserva mientras siga vendido y se limpia al salir (Deshacer, PRD §6.2).
  new.sold_at := case
    when new.status <> 'sold' then null
    when old.status = 'sold' then old.sold_at
    else now()
  end;

  -- El slug se fija una sola vez, al publicar, y nunca se vuelve a tocar.
  if old.slug is not null then
    new.slug := old.slug;
  elsif new.status <> 'draft' then
    new.slug := public.store_make_slug(new.title, new.code);
  end if;

  -- El código es la identidad que Jesús ve en WhatsApp: inmutable.
  new.code := old.code;
  return new;
end;
$fn$;

drop trigger if exists store_products_guard on public.store_products;
create trigger store_products_guard
  before insert or update on public.store_products
  for each row execute function public.store_products_guard();

-- ── 8. Guardia de fotos ─────────────────────────────────────────────────────
create or replace function public.store_images_guard()
  returns trigger
  language plpgsql
  set search_path = ''
as $fn$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    -- Lock del producto: dos subidas simultáneas desde el celular no pueden
    -- colarse las dos como la sexta foto.
    perform 1 from public.store_products where id = new.product_id for update;
    if (select count(*) from public.store_product_images where product_id = new.product_id) >= 6 then
      raise exception 'store_product_max_photos' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- DELETE: un artículo publicado no puede quedarse sin fotos. Si el producto
  -- ya no existe (borrado en cascada) no hay nada que proteger.
  select status into v_status from public.store_products where id = old.product_id;
  if v_status is not null and v_status <> 'draft'
     and not exists (
       select 1 from public.store_product_images i
        where i.product_id = old.product_id and i.id <> old.id
     ) then
    raise exception 'store_product_needs_a_photo' using errcode = 'P0001';
  end if;
  return old;
end;
$fn$;

drop trigger if exists store_images_guard on public.store_product_images;
create trigger store_images_guard
  before insert or delete on public.store_product_images
  for each row execute function public.store_images_guard();

-- ── 9. RLS ──────────────────────────────────────────────────────────────────
-- Todas las tablas con RLS (invariante 3). Solo el admin toca las tablas
-- directamente; el público pasa por la API (service role). No hay policy de
-- lectura anónima a propósito: un borrador nunca debe poder pedirse por REST.
alter table public.store_categories     enable row level security;
alter table public.store_products       enable row level security;
alter table public.store_product_images enable row level security;
alter table public.store_events         enable row level security;

drop policy if exists store_categories_admin_all on public.store_categories;
create policy store_categories_admin_all on public.store_categories for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists store_products_admin_all on public.store_products;
create policy store_products_admin_all on public.store_products for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists store_product_images_admin_all on public.store_product_images;
create policy store_product_images_admin_all on public.store_product_images for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- Los eventos los escribe la API con service role (valida y limita el ruido);
-- el admin los lee para el resumen del experimento.
drop policy if exists store_events_admin_read on public.store_events;
create policy store_events_admin_read on public.store_events for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- ── 10. Grants de tabla ─────────────────────────────────────────────────────
revoke all on table public.store_categories, public.store_products,
                    public.store_product_images, public.store_events
  from public, anon, authenticated;
grant all on table public.store_categories, public.store_products,
                   public.store_product_images, public.store_events to service_role;
grant select, insert, update, delete on table public.store_categories,
  public.store_products, public.store_product_images to authenticated;
grant select on table public.store_events to authenticated;
grant usage on sequence public.store_product_code_seq to service_role, authenticated;
grant usage on sequence public.store_events_id_seq to service_role;

-- ── 11. Bucket de fotos ─────────────────────────────────────────────────────
-- Público de lectura (las fotos van en <img>), escritura solo del admin. Mismo
-- techo que 0151: 3 MB y los tres formatos que produce el compresor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-products', 'store-products', true, 3145728,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store-products public read" on storage.objects;
create policy "store-products public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'store-products');
-- La escritura del admin ya la cubre "storage admin all" de 0005.

-- ── 12. RPC de listado público ──────────────────────────────────────────────
-- Service-only: la superficie pública es GET /api/v1/public/store. Insensible
-- a mayúsculas y tildes en AMBOS lados (f_unaccent, 0052), y busca en título,
-- descripción, categoría y talla (PRD §5.1). Devuelve las fotos ya anidadas
-- para no hacer N+1 desde la API.
--
-- Los vendidos NO viajan aquí: son otra sección con su propio tope (máx. 6),
-- así que los pide `list_store_sold`.
create or replace function public.list_store_products(
  p_query     text default null,
  p_category  text default null,   -- slug
  p_condition text default null,   -- 'new' | 'used'
  p_order     text default 'recent' -- 'recent' | 'price_asc' | 'price_desc'
) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_norm text := nullif(public.f_unaccent(lower(btrim(coalesce(p_query, '')))), '');
  v_like text;
  v_result jsonb;
begin
  if v_norm is not null then
    -- Escapa los comodines de LIKE: buscar «50%» no debe ser un comodín.
    v_like := '%' || replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) - 'sort_key' order by t.sort_key), '[]'::jsonb)
    into v_result
  from (
    select
      p.id, p.code, p.slug, p.title, p.price, p.original_price, p.is_clearance,
      p.negotiable, p.condition, p.condition_score, p.size_label, p.audience,
      p.status, p.cover_focus_x, p.cover_focus_y, p.created_at,
      c.slug as category_slug, c.name as category_name,
      (select i.thumb_url from public.store_product_images i
        where i.product_id = p.id order by i.position limit 1) as thumb_url,
      case p_order
        when 'price_asc'  then lpad((p.price * 100)::bigint::text, 12, '0')
        when 'price_desc' then lpad((99999999999 - (p.price * 100)::bigint)::text, 12, '0')
        else lpad((99999999999 - (extract(epoch from p.created_at) * 1000)::bigint)::text, 14, '0')
      end as sort_key
    from public.store_products p
    join public.store_categories c on c.id = p.category_id
    where p.status in ('available', 'reserved')
      and c.active
      and (p_category is null or c.slug = p_category)
      and (p_condition is null
           or (p_condition = 'new'  and p.condition in ('new_with_tag', 'new_unused'))
           or (p_condition = 'used' and p.condition = 'used'))
      and (v_like is null or
           public.f_unaccent(lower(
             coalesce(p.title, '') || ' ' || coalesce(p.description, '') || ' ' ||
             c.name || ' ' || coalesce(p.size_label, '')
           )) like v_like escape '\')
  ) t;

  return v_result;
end;
$fn$;

-- Vendidos recientemente: máximo 6, los más nuevos primero (PRD §5.1).
create or replace function public.list_store_sold(p_limit int default 6)
  returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  from (
    select
      p.id, p.code, p.slug, p.title, p.price, p.size_label, p.sold_at,
      p.cover_focus_x, p.cover_focus_y,
      (select i.thumb_url from public.store_product_images i
        where i.product_id = p.id order by i.position limit 1) as thumb_url
    from public.store_products p
    where p.status = 'sold'
    order by p.sold_at desc nulls last
    limit least(greatest(coalesce(p_limit, 6), 1), 6)
  ) t
$fn$;

-- REVOKE FROM PUBLIC no basta: los default privileges de Supabase dejan EXECUTE
-- a anon y authenticated. Se revoca explícito y se concede solo a service_role.
revoke execute on function public.list_store_products(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.list_store_sold(int) from public, anon, authenticated;
grant execute on function public.list_store_products(text, text, text, text) to service_role;
grant execute on function public.list_store_sold(int) to service_role;

-- Los triggers no se invocan a mano. `store_make_slug` la llama el trigger CON
-- EL ROL QUE ESCRIBE la fila (service_role desde la API, authenticated si el
-- admin escribe directo), igual que f_unaccent en 0052: no revocarla a ellos.
revoke execute on function public.store_products_guard() from public, anon, authenticated;
revoke execute on function public.store_images_guard()  from public, anon, authenticated;
revoke execute on function public.store_make_slug(text, text) from public, anon;
grant execute on function public.store_make_slug(text, text) to authenticated, service_role;
