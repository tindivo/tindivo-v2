-- =============================================================================
-- 0161 · El pueblo tiene una parte lejana, y alguien tiene que dibujarla
-- =============================================================================
--
-- QUÉ FALTA HOY
-- `orders.delivery_distance_band` la decide UNA sola persona: la cajera, con dos
-- botones, en el pedido manual (0126). En el pedido del cliente nadie la decide:
-- `create_customer_order` cobra `delivery_bands->>'near'` LITERAL, así que el
-- envío son S/ 2.00 caiga el pin donde caiga, y la columna se queda en NULL.
-- Medido sobre la base: 13 pedidos `customer_pwa`, los 13 sin banda.
--
-- Es el mismo defecto que la 0126 arregló para el pedido manual —"daba igual a
-- dónde fuera el pedido: S/ 2.00"— y que en el lado del cliente nadie volvió a
-- tocar.
--
-- QUÉ TRAE ESTA MIGRACIÓN
-- La geometría y la regla, NO el cobro. Aquí se crea dónde viven las zonas
-- lejanas y la función que responde "¿qué banda es este punto?". Enchufarla a
-- `create_customer_order` es el paso siguiente y va aparte a propósito: así esta
-- migración se puede aplicar y dibujar las zonas sin mover un céntimo, y el día
-- que se conecte el cobro ya hay geometría revisada detrás.
--
-- LO QUE **NO** SE TOCA
--   · `app_settings.coverage_polygon` se queda donde está. Define DÓNDE se
--     reparte, funciona, tiene editor en el panel y el navegador del cliente lo
--     lee directo por la whitelist `as_public_read`. Moverlo sería riesgo sin
--     premio. Las zonas lejanas son un concepto nuevo: tabla nueva.
--   · La cajera. Su selector manual sigue mandando en el pedido manual; el GPS
--     no entra ahí. Ella ya sabe si es cerca o lejos.
--
-- SIN POSTGIS, y es deliberado. No está instalado, y toda la geometría del repo
-- es aritmética a mano ya probada (`geo_distance_km` haversine, ray-casting en
-- plpgsql y su gemelo en TS). Añadir una extensión por tres polígonos y ~10
-- pedidos por noche es dependencia sin uso.
--
-- Idempotente.
-- =============================================================================

-- ── 1. El ray-casting, en UN solo sitio ──────────────────────────────────────
--
-- `point_in_coverage_polygon` lo llevaba embebido. Con varias zonas haría falta
-- otra copia, y una regla geométrica duplicada diverge igual que divergió la del
-- corte de caja hasta que 0141 la unificó en `order_cash_owed`.
--
-- El anillo es la MISMA forma que ya usa `coverage_polygon`: `[{lat,lng},…]`
-- abierto (el último punto no repite el primero). Así el editor del panel, el
-- `pointInPolygon` de TypeScript del cliente y esto hablan el mismo formato.

create or replace function public.point_in_ring(
  p_lat numeric,
  p_lng numeric,
  p_ring jsonb
) returns boolean
  language plpgsql immutable
as $$
declare
  v_n int;
  v_i int;
  v_j int;
  v_inside boolean := false;
  v_lat_i numeric; v_lng_i numeric;
  v_lat_j numeric; v_lng_j numeric;
begin
  if p_lat is null or p_lng is null or p_ring is null then
    return false;
  end if;
  if jsonb_typeof(p_ring) <> 'array' then
    return false;
  end if;

  v_n := jsonb_array_length(p_ring);
  if v_n < 3 then
    return false;
  end if;

  -- Ray casting con lat como eje Y y lng como eje X. El `nullif` cubre la arista
  -- horizontal: da NULL, la comparación da NULL y el cruce no se cuenta — que es
  -- lo correcto, porque en ese caso la condición de arriba ya era falsa.
  v_j := v_n - 1;
  for v_i in 0 .. (v_n - 1) loop
    v_lat_i := (p_ring -> v_i ->> 'lat')::numeric;
    v_lng_i := (p_ring -> v_i ->> 'lng')::numeric;
    v_lat_j := (p_ring -> v_j ->> 'lat')::numeric;
    v_lng_j := (p_ring -> v_j ->> 'lng')::numeric;

    if (((v_lat_i > p_lat) <> (v_lat_j > p_lat)) and
        (p_lng < (v_lng_j - v_lng_i) * (p_lat - v_lat_i) / nullif(v_lat_j - v_lat_i, 0) + v_lng_i)) then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;

  return v_inside;
end;
$$;

comment on function public.point_in_ring(numeric, numeric, jsonb) is
  'Punto dentro de un anillo [{lat,lng},…] abierto. Fuente única del ray-casting (0161).';

grant execute on function public.point_in_ring(numeric, numeric, jsonb)
  to anon, authenticated, service_role;

-- ── 2. Las zonas ─────────────────────────────────────────────────────────────
--
-- `kind` en vez de un booleano `is_far`: hoy solo existe 'far', pero el hueco
-- que ya se sabe que puede aparecer —una manzana a la que NO se llega, rodeada
-- de manzanas a las que sí— entra como 'exclusion' sin tocar el esquema. Un
-- booleano habría cerrado esa puerta.

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'far' check (kind in ('far', 'exclusion')),
  name text not null,
  -- Mismo formato que `app_settings.coverage_polygon`: anillo abierto.
  polygon jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  -- Un anillo necesita 3 vértices para encerrar algo. El tope evita que un
  -- trazo accidental de mil puntos entre a la tabla.
  constraint delivery_zones_ring_size check (
    jsonb_typeof(polygon) = 'array'
    and jsonb_array_length(polygon) between 3 and 200
  )
);

comment on table public.delivery_zones is
  'Zonas que cambian la banda de envío dentro de la cobertura. Fuera de toda zona = near (0161).';
comment on column public.delivery_zones.kind is
  'far = cobra la tarifa lejana. exclusion = reservado, todavía sin lector.';

-- El único acceso real: "las zonas activas", tanto para el panel como para el
-- cliente al mover el pin.
create index if not exists delivery_zones_active_idx
  on public.delivery_zones (kind) where active;

drop trigger if exists touch_delivery_zones on public.delivery_zones;
create trigger touch_delivery_zones
  before update on public.delivery_zones
  for each row execute function public.touch_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
--
-- El cliente TIENE que poder leerlas: mueve el pin y la pantalla le dice cuánto
-- va a pagar antes de confirmar. Solo las activas, y solo lectura — quién las
-- dibuja es el admin.

alter table public.delivery_zones enable row level security;

drop policy if exists dz_admin_all on public.delivery_zones;
create policy dz_admin_all on public.delivery_zones for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists dz_public_read on public.delivery_zones;
create policy dz_public_read on public.delivery_zones for select to anon, authenticated
  using (active);

-- ── 4. La regla: ¿qué banda es este punto? ───────────────────────────────────
--
-- NO comprueba cobertura, y es a propósito: son dos preguntas distintas y con
-- dos respuestas distintas. La cobertura decide SI se reparte (y ya la responde
-- `point_in_coverage_polygon` dentro de `create_customer_order`); esto decide
-- CUÁNTO cuesta. Mezclarlas obligaría a que una zona lejana mal dibujada, que se
-- salga un metro del contorno, rechazara la venta en vez de cobrar de más.
--
-- Fuera de toda zona: 'near'. Es el defecto que pidió el negocio y el que ya
-- cobra hoy, así que mientras nadie dibuje nada esta función no cambia un precio.

create or replace function public.delivery_band_for_point(
  p_lat numeric,
  p_lng numeric
) returns public.distance_band
  language sql stable security definer set search_path = ''
as $$
  select case
    when p_lat is null or p_lng is null then 'near'::public.distance_band
    when exists (
      select 1 from public.delivery_zones z
      where z.active
        and z.kind = 'far'
        and public.point_in_ring(p_lat, p_lng, z.polygon)
    ) then 'far'::public.distance_band
    else 'near'::public.distance_band
  end;
$$;

comment on function public.delivery_band_for_point(numeric, numeric) is
  'Banda de envío de una coordenada. Fuera de toda zona far = near (0161).';

grant execute on function public.delivery_band_for_point(numeric, numeric)
  to anon, authenticated, service_role;

-- ── 5. `point_in_coverage_polygon` pasa a usar el helper ─────────────────────
--
-- Mismo comportamiento, sin su copia del ray-casting. Y se corrige el centro de
-- respaldo: estaba en (-9.1547, -78.5042), que son ~25 km al oeste de San
-- Jacinto, mar adentro. Ver el bloque 6.

create or replace function public.point_in_coverage_polygon(p_lat numeric, p_lng numeric)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_poly_json jsonb;
  v_cov_json jsonb;
  v_center_lat numeric;
  v_center_lng numeric;
  v_radius_km numeric;
begin
  if p_lat is null or p_lng is null then
    return false;
  end if;

  select value into v_poly_json from public.app_settings where key = 'coverage_polygon';
  if v_poly_json is not null and jsonb_array_length(coalesce(v_poly_json -> 'polygon', '[]'::jsonb)) >= 3 then
    return public.point_in_ring(p_lat, p_lng, v_poly_json -> 'polygon');
  end if;

  -- Respaldo circular, solo si no hay polígono dibujado.
  select value into v_cov_json from public.app_settings where key = 'coverage';
  v_center_lat := coalesce((v_cov_json ->> 'centerLat')::numeric, -9.1465);
  v_center_lng := coalesce((v_cov_json ->> 'centerLng')::numeric, -78.2779);
  v_radius_km := coalesce((v_cov_json ->> 'radiusKm')::numeric, 3.0);

  return public.geo_distance_km(
    v_center_lat::double precision, v_center_lng::double precision,
    p_lat::double precision, p_lng::double precision
  ) <= v_radius_km;
end;
$$;

grant execute on function public.point_in_coverage_polygon(numeric, numeric)
  to anon, authenticated, service_role;

-- ── 6. San Jacinto estaba sembrado 25 km mar adentro ─────────────────────────
--
-- Tres claves de `app_settings` nacen con centro (-9.1547, -78.5042):
-- `coverage`, `location_validation` y el anillo de `coverage_polygon` (0045 y
-- 0086). El pueblo está en (-9.1465, -78.2779).
--
-- PRODUCCIÓN NO ESTÁ AFECTADA: las tres se corrigieron a mano en su día y el
-- polígono se redibujó con el editor del panel (14 vértices). Esto es un fallo
-- de REPRODUCIBILIDAD: los seeds usan `on conflict do nothing`, así que un
-- `supabase db reset` —que no tiene fila previa— entra con las coordenadas
-- malas. Y como el CHECK de `address_directory` (0122) solo admite
-- lng ∈ [-78.33, -78.23], la cobertura quedaría ENTERA fuera de la única caja de
-- coordenadas que la base acepta: todo pedido del cliente rechazado por "fuera
-- de cobertura", con un mensaje que no apunta a nada de esto.
--
-- Se corrige SOLO si el valor sigue siendo el equivocado (`lng < -78.4`), así
-- que en prod es un no-op y nadie pisa un polígono dibujado a mano.

update public.app_settings
   set value = value || '{"centerLat": -9.1465, "centerLng": -78.2779}'::jsonb
 where key in ('coverage', 'location_validation')
   and (value ->> 'centerLng')::numeric < -78.4;

update public.app_settings
   set value = jsonb_build_object('polygon', '[
        {"lat": -9.14722321379601,  "lng": -78.28638553619385},
        {"lat": -9.151036456896874, "lng": -78.28458309173585},
        {"lat": -9.155358082989405, "lng": -78.28458309173585},
        {"lat": -9.154764921733651, "lng": -78.27840328216554},
        {"lat": -9.152392266815049, "lng": -78.2774591445923},
        {"lat": -9.148833254757374, "lng": -78.27754497528078},
        {"lat": -9.149087471085256, "lng": -78.27462673187257},
        {"lat": -9.146884256875804, "lng": -78.27539920806886},
        {"lat": -9.14510472774794,  "lng": -78.27127933502199},
        {"lat": -9.144087849965702, "lng": -78.27359676361085},
        {"lat": -9.14137616167847,  "lng": -78.27282428741456},
        {"lat": -9.138325487670363, "lng": -78.27119350433351},
        {"lat": -9.136376432263054, "lng": -78.27720165252687},
        {"lat": -9.140634680816666, "lng": -78.28572034835817}
      ]'::jsonb)
 where key = 'coverage_polygon'
   and (value -> 'polygon' -> 0 ->> 'lng')::numeric < -78.4;
