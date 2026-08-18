-- =============================================================================
-- 0165 · El negocio deja de compartirse como un UUID
-- =============================================================================
--
-- QUÉ FALTA HOY
-- La página de un negocio vive en `/negocio/<uuid>`. Tindivo se reparte por
-- WhatsApp, y ahí ese enlace se lee así:
--
--   tindivo.com/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7
--
-- No se puede dictar por teléfono, no se puede imprimir en un volante, y en un
-- pueblo parece un enlace de estafa. Google tampoco lee nada dentro de un UUID.
--
-- El v1 SÍ tenía slugs (`/restaurantes/priamo`, `/restaurantes/la-florencia`) y
-- Google los tiene indexados: hoy salen como 404 en Search Console. Esta
-- migración es la mitad de base de datos de recuperarlos.
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE, Y ES DELIBERADO
-- El slug NO sigue al nombre. Si mañana "Pizza Priamo" pasa a llamarse "Priamo
-- Pizzería", su URL se queda en `pizza-priamo`. Un slug que se regenera solo al
-- renombrar rompe todos los enlaces repartidos y deja el anterior en 404 — que
-- es exactamente el problema que venimos a arreglar. Cambiar una URL publicada
-- es una decisión, no un efecto secundario de editar un nombre.
--
-- SIN `unaccent`, aunque la extensión esté instalada. Vive en el esquema
-- `extensions` y es STABLE, no IMMUTABLE; llamarla desde una función con
-- `SET search_path = ''` (invariante 3 del repo) obliga a cualificar además el
-- diccionario y es una fuente conocida de fallos en runtime. `translate()` con
-- el juego de acentos del español es inmutable, explícito y suficiente: los
-- negocios de San Jacinto se llaman en castellano.
--
-- Idempotente.
-- =============================================================================

-- ── 1. La regla: nombre → slug ───────────────────────────────────────────────
--
-- Un solo sitio que decida cómo se ve una URL. Lo usan el backfill de abajo, el
-- trigger de altas y el panel admin cuando previsualiza.

create or replace function public.slugify(p_text text)
returns text
language sql immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        translate(
          lower(coalesce(p_text, '')),
          'áéíóúüñàèìòùâêîôûäëïöçÁÉÍÓÚÜÑ',
          'aeiouunaeiouaeiouaeiocAEIOUUN'
        ),
        -- Todo lo que no sea letra ASCII, dígito o guion pasa a guion.
        '[^a-z0-9]+', '-', 'g'
      ),
      -- Guiones consecutivos colapsan a uno.
      '-{2,}', '-', 'g'
    )
  );
$$;

comment on function public.slugify(text) is
  'Nombre → slug de URL. Sin acentos, minúsculas, separado por guiones (0165).';

grant execute on function public.slugify(text) to anon, authenticated, service_role;

-- ── 2. La columna ────────────────────────────────────────────────────────────
--
-- Entra nullable para poder rellenarla; el NOT NULL se pone al final, cuando ya
-- no queda ninguna fila sin slug.

alter table public.businesses add column if not exists slug text;

comment on column public.businesses.slug is
  'Identificador legible en la URL pública (/negocio/<slug>). NO sigue al nombre: ver 0165.';

-- ── 3. Backfill, resolviendo colisiones ──────────────────────────────────────
--
-- Dos negocios pueden llamarse igual. El primero por antigüedad se queda el
-- slug limpio y los siguientes llevan sufijo, que es el criterio menos
-- sorprendente: el que lleva más tiempo publicado conserva su URL.
--
-- El `coalesce` cubre el nombre que se queda en nada al limpiarlo (por ejemplo
-- uno hecho solo de símbolos): antes que fallar, cae a un slug derivado del id.

with numbered as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'negocio-' || left(id::text, 8)) as base,
    row_number() over (
      partition by coalesce(nullif(public.slugify(name), ''), 'negocio-' || left(id::text, 8))
      order by created_at, id
    ) as rn
  from public.businesses
  where slug is null
)
update public.businesses b
   set slug = case when n.rn = 1 then n.base else n.base || '-' || n.rn end
  from numbered n
 where b.id = n.id;

-- ── 4. Unicidad ──────────────────────────────────────────────────────────────
--
-- Es una clave de acceso público: dos negocios con el mismo slug significaría
-- que una URL no sabe a quién apunta.

create unique index if not exists businesses_slug_key on public.businesses (slug);

alter table public.businesses alter column slug set not null;

-- ── 5. Las altas traen su slug solo ──────────────────────────────────────────
--
-- El admin no debería tener que inventarlo al crear un negocio, pero sí puede
-- escribirlo si quiere uno concreto: si viene informado se normaliza y se
-- respeta; si viene vacío se deriva del nombre.
--
-- `update of slug` y NO `update` a secas: renombrar el negocio no toca la URL
-- (ver la cabecera). Solo se recalcula si alguien pone el slug explícitamente
-- a NULL, que es la forma de pedir "regenéralo".

create or replace function public.businesses_set_slug()
returns trigger
language plpgsql
as $$
declare
  v_base text;
  v_slug text;
  v_n int := 1;
begin
  if new.slug is not null and public.slugify(new.slug) <> '' then
    new.slug := public.slugify(new.slug);
  else
    new.slug := null;
  end if;

  if new.slug is null then
    v_base := coalesce(nullif(public.slugify(new.name), ''), 'negocio-' || left(new.id::text, 8));
  else
    v_base := new.slug;
  end if;

  v_slug := v_base;
  while exists (
    select 1 from public.businesses where slug = v_slug and id is distinct from new.id
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

comment on function public.businesses_set_slug() is
  'Deriva y desambigua el slug en altas. No se dispara al renombrar (0165).';

drop trigger if exists businesses_slug_guard on public.businesses;
create trigger businesses_slug_guard
  before insert or update of slug on public.businesses
  for each row execute function public.businesses_set_slug();

-- ── 6. La búsqueda también devuelve el slug ──────────────────────────────────
--
-- Sin esto, los resultados de búsqueda serían el único sitio de la app que
-- sigue enlazando por uuid: funcionarían (el front redirige 308 al slug), pero
-- pagando un salto de más en la ruta que más se usa para descubrir un plato.
--
-- Respecto a la versión anterior cambian TRES cosas, y solo la primera altera
-- lo que la función devuelve:
--
--   1. Los campos nuevos: `slug` en negocios y `business_slug` en platos.
--   2. El escape de comodines de LIKE se escribe con `chr(92)` en vez de con
--      literales `'\'` / `'\\'`. Es el MISMO comportamiento, pero un backslash
--      literal dentro de un `$function$` que viaja por heredocs y editores se
--      colapsa con una facilidad pasmosa — de hecho pasó al escribir esta
--      migración, y un `replace(x, '\', '\')` silencioso deja el escape en
--      no-op sin que nada falle a la vista. `chr(92)` no se puede malinterpretar.
--   3. Por lo mismo, el separador de términos pasa de `'\s+'` a la clase POSIX
--      `'[[:space:]]+'`, equivalente para partir por espacios y sin backslash.

create or replace function public.search_catalog(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_norm text;      -- query normalizada SIN escapar (para similarity/ranking)
  v_esc text;       -- query con los comodines de LIKE escapados
  v_terms text[];   -- términos escapados (el más largo primero, máx 5)
  v_patterns text[];
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_businesses jsonb;
  v_items jsonb;
begin
  v_norm := public.f_unaccent(lower(trim(coalesce(p_query, ''))));
  if length(v_norm) < 2 then
    return jsonb_build_object('businesses', '[]'::jsonb, 'items', '[]'::jsonb);
  end if;

  -- Escape de comodines de LIKE. El orden importa: el backslash PRIMERO, o los
  -- backslashes que introducen los dos replace siguientes se volverían a escapar.
  v_esc := replace(v_norm, chr(92), chr(92) || chr(92));
  v_esc := replace(v_esc, '%', chr(92) || '%');
  v_esc := replace(v_esc, '_', chr(92) || '_');

  -- Términos >=2 chars, el más largo primero: v_terms[1] es el LIKE indexable
  -- más selectivo; el resto entra como filtro AND vía LIKE ALL (multi-palabra:
  -- "pollo brasa" encuentra "Pollo a la brasa").
  select array_agg(t order by length(t) desc, ord) into v_terms
  from (
    select t, ord
    from unnest(regexp_split_to_array(v_esc, '[[:space:]]+')) with ordinality as u(t, ord)
    where length(t) >= 2
    order by length(t) desc, ord
    limit 5
  ) s;
  if v_terms is null then
    return jsonb_build_object('businesses', '[]'::jsonb, 'items', '[]'::jsonb);
  end if;
  select array_agg('%' || t || '%') into v_patterns from unnest(v_terms) as t;

  -- Negocios (mismos filtros de publicación que /public/businesses).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'slug', t.slug,
      'name', t.name,
      'tagline', t.tagline,
      'accent_color', t.accent_color,
      'logo_url', t.logo_url,
      'primary_capability', t.primary_capability,
      'estimated_eta_min', t.estimated_eta_min,
      'estimated_eta_max', t.estimated_eta_max
    ) order by t.sim desc, t.name), '[]'::jsonb)
  into v_businesses
  from (
    select b.id, b.slug, b.name, b.tagline, b.accent_color, b.logo_url, b.primary_capability,
           b.estimated_eta_min, b.estimated_eta_max,
           extensions.similarity(
             public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))), v_norm) as sim
    from public.businesses b
    where b.publishes_catalog and b.is_active and not b.is_blocked
      and public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))) like ('%' || v_terms[1] || '%')
      and public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))) like all (v_patterns)
    order by sim desc, b.name
    limit v_limit
  ) t;

  -- Platos disponibles de negocios publicados, en categorías activas (paridad
  -- con el menú público). La pausa (accepting_orders_until) NO filtra aquí:
  -- es transitoria y la página del negocio gestiona el bloqueo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'business_id', t.business_id,
      'business_slug', t.business_slug,
      'business_name', t.business_name,
      'name', t.name,
      'description', t.description,
      'base_price', t.base_price,
      'image_url', t.image_url,
      'image_hue', t.image_hue
    ) order by t.sim desc, t.name), '[]'::jsonb)
  into v_items
  from (
    select mi.id, mi.business_id, b.slug as business_slug, b.name as business_name,
           mi.name, mi.description, mi.base_price, mi.image_url, mi.image_hue,
           extensions.similarity(
             public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))), v_norm) as sim
    from public.menu_items mi
    join public.businesses b
      on b.id = mi.business_id
     and b.publishes_catalog and b.is_active and not b.is_blocked
    join public.menu_categories mc
      on mc.id = mi.category_id and mc.is_active
    where mi.is_available and mi.deleted_at is null
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like ('%' || v_terms[1] || '%')
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like all (v_patterns)
    order by sim desc, mi.name
    limit v_limit
  ) t;

  return jsonb_build_object('businesses', v_businesses, 'items', v_items);
end;
$function$;

