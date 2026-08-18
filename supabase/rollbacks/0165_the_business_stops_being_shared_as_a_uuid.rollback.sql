-- =============================================================================
-- ROLLBACK de 0165 — el negocio deja de compartirse como uuid
--
-- Deshace: columna businesses.slug, su indice unico, el trigger que la rellena,
-- las funciones slugify()/businesses_set_slug() y la sustitucion de
-- search_catalog(), que vuelve a la definicion de 0152 (la que corria en
-- produccion antes del push, verificada contra pg_get_functiondef del remoto).
--
-- Generado por composicion de ficheros, NO por heredoc: la definicion de 0152
-- lleva backslashes en el escapado de LIKE y un heredoc los colapsa en
-- silencio, dejando un replace(x, chr(92), chr(92)) que es un no-op.
-- =============================================================================

drop trigger if exists businesses_slug_guard on public.businesses;
drop function if exists public.businesses_set_slug();
drop index if exists public.businesses_slug_key;
alter table public.businesses drop column if exists slug;
drop function if exists public.slugify(text);

-- search_catalog vuelve a la definicion de 0152 --------------------------------

CREATE OR REPLACE FUNCTION public.search_catalog(p_query text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_norm text;      -- query normalizada SIN escapar (para similarity/ranking)
  v_esc text;       -- query con \ % _ escapados (para LIKE)
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

  -- Escape de wildcards de LIKE. El orden importa: el backslash PRIMERO.
  v_esc := replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_');

  -- Términos >=2 chars, el más largo primero: v_terms[1] es el LIKE indexable
  -- más selectivo; el resto entra como filtro AND vía LIKE ALL (multi-palabra:
  -- "pollo brasa" encuentra "Pollo a la brasa").
  select array_agg(t order by length(t) desc, ord) into v_terms
  from (
    select t, ord
    from unnest(regexp_split_to_array(v_esc, '\s+')) with ordinality as u(t, ord)
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
    select b.id, b.name, b.tagline, b.accent_color, b.logo_url, b.primary_capability,
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
      'business_name', t.business_name,
      'name', t.name,
      'description', t.description,
      'base_price', t.base_price,
      'image_url', t.image_url,
      'image_hue', t.image_hue
    ) order by t.sim desc, t.name), '[]'::jsonb)
  into v_items
  from (
    select mi.id, mi.business_id, b.name as business_name, mi.name, mi.description,
           mi.base_price, mi.image_url, mi.image_hue,
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
