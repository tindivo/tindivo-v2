-- =============================================================================
-- 0052 · Buscador del catálogo (negocios + platos).
--
-- unaccent + pg_trgm; índices GIN trigram sobre la expresión normalizada
-- (lower + sin tildes) y RPC search_catalog service-only (la superficie
-- pública es GET /api/v1/public/search). Insensible a mayúsculas y tildes
-- porque AMBOS lados (query y columnas) se normalizan igual. Idempotente.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Wrapper IMMUTABLE de unaccent (unaccent() es STABLE y no se puede indexar).
-- El diccionario va schema-calificado DENTRO del cast: con search_path='' un
-- 'unaccent'::regdictionary sin calificar fallaría. Si algún día se editan las
-- reglas del diccionario: REINDEX de los índices *_search_trgm_idx.
-- NO revocar EXECUTE de anon/authenticated: los índices de expresión evalúan
-- esta función con el rol que ESCRIBE la fila, y el panel de negocios escribe
-- menu_items directo vía PostgREST como authenticated.
create or replace function public.f_unaccent(p_text text)
  returns text
  language sql immutable parallel safe strict
  set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text)
$$;

-- anon NO escribe filas → no necesita evaluar índices de expresión (y sin esto
-- quedaría invocable vía /rest/v1/rpc/f_unaccent: hereda EXECUTE del grant
-- default a PUBLIC). Se regrantea explícito a los roles que SÍ escriben filas
-- indexadas: authenticated (panel → menu_items) y service_role (API → businesses).
revoke execute on function public.f_unaccent(text) from public, anon;
grant execute on function public.f_unaccent(text) to authenticated, service_role;

create index if not exists menu_items_search_trgm_idx
  on public.menu_items
  using gin ((public.f_unaccent(lower(name || ' ' || coalesce(description, '')))) extensions.gin_trgm_ops);

create index if not exists businesses_search_trgm_idx
  on public.businesses
  using gin ((public.f_unaccent(lower(name || ' ' || coalesce(tagline, '')))) extensions.gin_trgm_ops);

-- Busca negocios publicados y platos disponibles por texto, insensible a
-- mayúsculas y tildes. Solo columnas públicas seguras (paridad con
-- /public/businesses). is_open_now NO se calcula aquí: la fuente de verdad
-- del horario es getOpenStatus() en TS (DECISIONS §19) y el cliente enriquece.
create or replace function public.search_catalog(p_query text, p_limit int default 20)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
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
    where mi.is_available
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like ('%' || v_terms[1] || '%')
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like all (v_patterns)
    order by sim desc, mi.name
    limit v_limit
  ) t;

  return jsonb_build_object('businesses', v_businesses, 'items', v_items);
end;
$$;

-- Superficie service-only (patrón 0009): el público entra por el endpoint REST.
revoke all on function public.search_catalog(text, int) from public, anon, authenticated;
grant execute on function public.search_catalog(text, int) to service_role;
