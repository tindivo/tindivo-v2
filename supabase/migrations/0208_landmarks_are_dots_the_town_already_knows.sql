-- =============================================================================
-- 0208 · Los landmarks son puntos que el pueblo ya conoce
-- =============================================================================
--
-- POR QUÉ.
--   El mapa de elegir ubicación (`apps/customer`) es hoy un lienzo mudo: calles
--   y el pin del cliente, nada más. Para alguien que no reconoce su calle por
--   nombre, no hay nada en el mapa que ayude a ubicarse — ni la botica de la
--   esquina, ni el colegio, ni el coliseo. Esta tabla es la referencia
--   geográfica que el admin cura a mano (botica, mercado, colegio, iglesia,
--   coliseo, parque…) para pintarla como ayuda visual sobre el mapa.
--
-- POR QUÉ TABLA Y NO `app_settings` (donde vive `coverage_polygon`).
--   `coverage_polygon` es UNA geometría que se reescribe entera cada vez que se
--   edita. Esto es una LISTA que crece de a un punto por vez —el admin agrega
--   una botica, corrige una coordenada, desactiva un colegio que cerró— y eso es
--   exactamente lo que un blob JSON hace mal: cada edición reescribe el array
--   completo, sin historial de fila ni posibilidad de blanquear una entrada sin
--   tocar las demás.
--
-- POR QUÉ EL FORMATO ES EL MISMO QUE `delivery_zones` (0161).
--   Mismo problema de forma: geometría de referencia, curada por el admin,
--   leída en el mapa del cliente. RLS calcada a propósito.
--
-- SANIDAD GEOGRÁFICA: la misma caja que `address_directory` (0122) —
-- lat [-9.20, -9.10] x lng [-78.33, -78.23]—, para que una coordenada mal
-- tecleada al cargar un landmark no entre silenciosa y aparezca un pin en el
-- mar o en otro departamento.
--
-- Idempotente.
-- =============================================================================

-- ── 1. Categoría ──────────────────────────────────────────────────────────────
--
-- Fuente única en @tindivo/contracts (MAP_LANDMARK_CATEGORIES); este enum tiene
-- que coincidir EXACTAMENTE — lo verifica el test de drift de packages/core.

do $$ begin
  create type public.map_landmark_category as enum (
    'salud',
    'mercado',
    'educacion',
    'religioso',
    'deporte',
    'recreacion',
    'gobierno',
    'otro'
  );
exception when duplicate_object then null;
end $$;

-- ── 2. Tabla ──────────────────────────────────────────────────────────────────

create table if not exists public.map_landmarks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    public.map_landmark_category not null,
  lat         numeric(10,7) not null,
  lng         numeric(10,7) not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null,
  constraint map_landmarks_name_len check (length(btrim(name)) between 2 and 80),
  constraint map_landmarks_in_town check (
    lat between -9.20 and -9.10 and
    lng between -78.33 and -78.23
  )
);

comment on table public.map_landmarks is
  'Referencias geograficas curadas a mano (botica, colegio, mercado...) para orientar al cliente en el mapa de ubicacion (0208).';

-- El único acceso real: "los activos", tanto para el panel como para el cliente
-- al abrir el mapa.
create index if not exists map_landmarks_active_idx
  on public.map_landmarks (category) where active;

drop trigger if exists touch_map_landmarks on public.map_landmarks;
create trigger touch_map_landmarks
  before update on public.map_landmarks
  for each row execute function public.touch_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
--
-- El cliente lee directo desde el navegador (mismo patrón que
-- `coverage_polygon` y `delivery_zones`): es geometría de solo lectura detrás
-- de RLS, así que meterla en el REST API solo sumaría el piso fijo de ~500ms
-- del salto a la API sin ningún control adicional que ganar.

alter table public.map_landmarks enable row level security;

drop policy if exists ml_admin_all on public.map_landmarks;
create policy ml_admin_all on public.map_landmarks for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists ml_public_read on public.map_landmarks;
create policy ml_public_read on public.map_landmarks for select to anon, authenticated
  using (active);
