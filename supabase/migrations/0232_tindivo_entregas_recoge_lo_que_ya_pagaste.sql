-- =============================================================================
-- 0232 · Tindivo Entregas: recoge lo que ya pagaste y lo lleva
-- =============================================================================
--
-- QUÉ ES.
--   «Tindivo Entregas» (nombre técnico `courier`): el cliente ya pidió y pagó
--   algo en un punto A (un negocio del directorio, u «otro lugar o persona») y
--   un motorizado lo recoge y lo lleva a un punto B dentro de San Jacinto, por
--   S/ 3. Tindivo no compra ni paga nada — solo transporta. Ver
--   `Docs/Encargos/Tindivo — Catálogo de negocios y Encargos (spec v1).md`.
--
-- POR QUÉ TABLAS PROPIAS, NO `orders`/`businesses`.
--   `orders.business_id` es NOT NULL y las ocho funciones que escriben
--   `orders.status` (invariante 8 de CLAUDE.md) dan por hecho un negocio con
--   comisión, cocina y RLS de cajera detrás. El camino «otro lugar o persona»
--   de este diseño no siempre tiene negocio, y la máquina de estados es otra.
--   `businesses` carga 144 migraciones de columnas para un partner operando de
--   verdad (comisión, dashboard, RLS de cajera): no tiene sentido meter ahí
--   cientos de negocios informales con casi nada de datos. Van dos tablas:
--
--     · `directory_businesses` — el catálogo/mapa: nombre, categoría, pin,
--       teléfono, horario referencial, foto de portada, y los flags que
--       deciden el pin/tarjeta (aliado / recojo habilitado / solo visible).
--     · `courier_orders` — la solicitud, con SNAPSHOT (no FK obligatoria): si
--       el cliente eligió un negocio del directorio, `directory_business_id`
--       queda solo como referencia para métricas; los datos que de verdad usa
--       el pedido (`origin_*`/`destination_*`) se copian al crear y no
--       dependen de que el negocio exista o cambie después. Así «elegir del
--       catálogo» y «otro lugar o persona» llenan la misma fila de la misma
--       forma.
--
--   `courier` en inglés, no `pickup` (81 migraciones 0219-0225 ya usan ese
--   nombre para el recojo en mostrador de un pedido normal — mecanismo
--   distinto) ni `recojo`/`encargos` (126 apariciones de "recojo" en
--   apps/customer para ESE otro sentido).
--
-- ALCANCE DE ESTA MIGRACIÓN.
--   Solo lo que el lado CLIENTE necesita: crear una solicitud, verla, seguirla,
--   cancelarla, y navegar el directorio. `advance_courier_order` modela ya las
--   transiciones del motorizado (para que la máquina de estados completa quede
--   probada por tests de integración desde el día uno), pero ninguna app la
--   expone todavía — eso es la fase siguiente, con su propio diseño.
--   `driver_payment_qrs` / `courier_remittances` (deuda y rendición del
--   motorizado) NO se crean aquí: pertenecen a esa fase.
--
-- Idempotente (CREATE OR REPLACE / DROP ... IF EXISTS / ON CONFLICT DO NOTHING).
-- =============================================================================

-- ── 1 · Enums ────────────────────────────────────────────────────────────────
-- Fuente única en @tindivo/contracts (enums.ts: COURIER_STATUSES, COURIER_PAYERS,
-- COURIER_CANCEL_REASONS, DIRECTORY_BUSINESS_CATEGORIES). El test de drift de
-- packages/core/src/enum-drift.ts exige que coincidan EXACTAMENTE.

do $$ begin
  create type public.courier_status as enum (
    'requested',
    'accepted',
    'heading_to_pickup',
    'at_pickup',
    'picked_up',
    'heading_to_dropoff',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.courier_payer as enum ('origin', 'destination');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.courier_cancel_reason as enum (
    'no_driver',
    'driver_rejected',
    'not_ready',
    'transport_unpaid',
    'customer_cancelled',
    'unreachable',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.directory_business_category as enum (
    'chicken_grill',
    'chifa',
    'pizza_burgers',
    'snacks',
    'desserts',
    'drinks_liquor',
    'pharmacy',
    'bodega',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- ── 2 · directory_businesses ─────────────────────────────────────────────────
-- Mismo patrón que `map_landmarks` (0208): curada a mano por el admin (sin
-- panel todavía — se siembra por script en esta fase), leída directo desde el
-- navegador (RLS, sin pasar por /api/v1 — es geometría/catálogo de solo
-- lectura, y el salto a la API cuesta ~500ms de piso sin ganar ningún control
-- adicional). Misma caja de sanidad geográfica que `map_landmarks`/
-- `address_directory`: lat [-9.20,-9.10] x lng [-78.33,-78.23].

create table if not exists public.directory_businesses (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  category              public.directory_business_category not null,
  lat                   numeric(10,7) not null,
  lng                   numeric(10,7) not null,
  reference_text        text not null,
  phone                 text,
  whatsapp              text,
  opens_at              text,   -- 'HH:MM', referencial — nunca bloquea (spec v1 §3)
  closes_at             text,
  cover_photo_url       text,
  -- Flags que deciden pin/tarjeta (spec v1 §2 y §3.1). `is_partner` y
  -- `courier_enabled` son conceptualmente excluyentes (un aliado pide directo
  -- por Tindivo, no aplica el recojo) pero NO se fuerza con un CHECK: un
  -- aliado que además deja de operar el recojo un día no debería requerir
  -- tocar dos columnas a la vez bajo presión. `directoryCardStateOf()` en
  -- @tindivo/contracts resuelve la prioridad (partner > courier_enabled >
  -- visible_only) en un solo sitio.
  visible_on_map        boolean not null default true,
  courier_enabled       boolean not null default false,
  is_partner            boolean not null default false,
  partner_business_id   uuid references public.businesses(id) on delete set null,
  has_menu_in_tindivo   boolean not null default false,
  works_with_zorritos   boolean not null default false,
  last_verified_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.users(id) on delete set null,
  constraint db_name_len check (length(btrim(name)) between 2 and 120),
  constraint db_reference_len check (length(btrim(reference_text)) between 2 and 140),
  constraint db_in_town check (lat between -9.20 and -9.10 and lng between -78.33 and -78.23),
  constraint db_partner_needs_link check (not is_partner or partner_business_id is not null)
);

comment on table public.directory_businesses is
  'Directorio/catálogo de negocios de San Jacinto para Tindivo Entregas (spec v1 §3). Curado a mano; no confundir con businesses (partners operando de verdad en Tindivo).';

create index if not exists db_visible_idx on public.directory_businesses (category) where visible_on_map;
create index if not exists db_courier_enabled_idx on public.directory_businesses (id) where courier_enabled;

drop trigger if exists touch_directory_businesses on public.directory_businesses;
create trigger touch_directory_businesses
  before update on public.directory_businesses
  for each row execute function public.touch_updated_at();

alter table public.directory_businesses enable row level security;

drop policy if exists db_admin_all on public.directory_businesses;
create policy db_admin_all on public.directory_businesses for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists db_public_read on public.directory_businesses;
create policy db_public_read on public.directory_businesses for select to anon, authenticated
  using (visible_on_map);

-- ── 3 · courier_orders ───────────────────────────────────────────────────────

create sequence if not exists public.courier_order_number_seq;

create table if not exists public.courier_orders (
  id                        uuid primary key default gen_random_uuid(),
  short_id                  text not null unique,
  order_number              bigint not null default nextval('public.courier_order_number_seq'),

  customer_user_id          uuid not null references public.users(id),
  requester_name            text not null,
  requester_phone           text not null,

  -- Snapshot del punto A. `directory_business_id` es solo referencia para
  -- métricas (spec v1 §9) — nunca se lee para resolver el pedido.
  directory_business_id     uuid references public.directory_businesses(id) on delete set null,
  origin_name               text not null,
  origin_phone              text,
  origin_lat                numeric(10,7) not null,
  origin_lng                numeric(10,7) not null,
  origin_reference_text     text not null,

  -- Snapshot del punto B.
  destination_name          text not null,
  destination_phone         text,
  destination_lat           numeric(10,7) not null,
  destination_lng           numeric(10,7) not null,
  destination_reference_text text not null,

  item_description          text not null,
  is_fragile                boolean not null default false,

  ready_in_min              int not null default 0,
  ready_at                  timestamptz not null,

  payer                     public.courier_payer not null default 'destination',
  -- Lo marca el motorizado al cobrar (fase siguiente); la columna existe desde
  -- ya para no requerir otra migración cuando esa fase construya sobre esto.
  payment_method            text check (payment_method is null or payment_method in ('cash', 'yape')),
  transport_collected_at    timestamptz,
  fee_amount                numeric(10,2) not null,
  distance_m                numeric(10,2),

  weight_confirmed          boolean not null,
  prepaid_confirmed         boolean not null,

  status                    public.courier_status not null default 'requested',
  driver_id                 uuid references public.drivers(id),

  accepted_at               timestamptz,
  departed_at               timestamptz,
  arrived_at                timestamptz,
  picked_up_at              timestamptz,
  departed_dropoff_at       timestamptz,
  delivered_at              timestamptz,
  cancelled_at              timestamptz,
  cancel_reason             public.courier_cancel_reason,

  utm_source                text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint co_item_description_len check (length(btrim(item_description)) between 1 and 120),
  constraint co_origin_reference_len check (length(btrim(origin_reference_text)) >= 5),
  constraint co_destination_reference_len check (length(btrim(destination_reference_text)) >= 5),
  constraint co_ready_in_min_range check (ready_in_min between 0 and 180),
  constraint co_fee_amount_nonneg check (fee_amount >= 0),
  constraint co_cancel_reason_present check (
    (status = 'cancelled') = (cancel_reason is not null)
  ),
  constraint co_origin_in_town check (
    origin_lat between -9.20 and -9.10 and origin_lng between -78.33 and -78.23
  ),
  constraint co_destination_in_town check (
    destination_lat between -9.20 and -9.10 and destination_lng between -78.33 and -78.23
  )
);

comment on table public.courier_orders is
  'Tindivo Entregas: solicitudes de recojo prepagado (spec v1). Tabla propia, máquina de estados propia — no orders.';

create index if not exists co_customer_idx on public.courier_orders (customer_user_id, created_at desc);
create index if not exists co_driver_idx on public.courier_orders (driver_id) where driver_id is not null;
create index if not exists co_requested_idx on public.courier_orders (created_at) where status = 'requested';
create index if not exists co_active_by_phone_idx on public.courier_orders (requester_phone)
  where status not in ('delivered', 'cancelled');

drop trigger if exists touch_courier_orders on public.courier_orders;
create trigger touch_courier_orders
  before update on public.courier_orders
  for each row execute function public.touch_updated_at();

alter table public.courier_orders enable row level security;

-- El cliente ve solo lo suyo. Sin INSERT/UPDATE por policy: se crea y avanza
-- SOLO por RPC (`create_courier_order`/`advance_courier_order`, SECURITY
-- DEFINER), igual que `orders` — el patrón de `active-orders.ts` lee esta
-- tabla DIRECTO desde el navegador con esta misma policy.
drop policy if exists co_customer_select on public.courier_orders;
create policy co_customer_select on public.courier_orders for select to authenticated
  using (customer_user_id = (select auth.uid()));

drop policy if exists co_admin_all on public.courier_orders;
create policy co_admin_all on public.courier_orders for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- Motorizado: lectura de detalle completo SOLO de los suyos (aceptados). El
-- panel del motorizado (fase siguiente) necesita además ver los `requested`
-- con columnas limitadas — eso se resuelve con una vista/RPC cuando esa fase
-- arranque; no se expone aquí para no adelantar una superficie sin UI real que
-- la use ni pruebas que la cubran.
drop policy if exists co_driver_select_own on public.courier_orders;
create policy co_driver_select_own on public.courier_orders for select to authenticated
  using (driver_id = (select public.current_driver_id()));

-- ── 4 · courier_order_events ─────────────────────────────────────────────────
-- Historial inmutable de auditoría, patrón `order_event_log` (0002).

create table if not exists public.courier_order_events (
  id                uuid primary key default gen_random_uuid(),
  courier_order_id  uuid not null references public.courier_orders(id) on delete cascade,
  event_type        text not null,
  actor_role        text,
  actor_user_id     uuid references public.users(id),
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.courier_order_events is
  'Log de auditoría de transiciones de courier_orders (reconstrucción de cualquier caso).';

create index if not exists coe_order_idx on public.courier_order_events (courier_order_id, created_at);

alter table public.courier_order_events enable row level security;

drop policy if exists coe_customer_select on public.courier_order_events;
create policy coe_customer_select on public.courier_order_events for select to authenticated
  using (
    exists (
      select 1 from public.courier_orders co
      where co.id = courier_order_id and co.customer_user_id = (select auth.uid())
    )
  );

drop policy if exists coe_admin_all on public.courier_order_events;
create policy coe_admin_all on public.courier_order_events for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- ── 5 · Configuración: app_settings.courier + app_settings.timers ───────────
-- Todo parte APAGADO (`enabled: false`) — se enciende a mano cuando Jesús esté
-- listo para el piloto. Precio, horario y límites SALEN DE AQUÍ, nunca
-- hardcodeados en TS ni en SQL (DECISIONS §10).

insert into public.app_settings (key, value) values
  ('courier', '{
    "enabled": false,
    "pricing": {"basePrice": 3.00},
    "hours": {"start": "18:00", "end": "23:00"},
    "pausedMessage": "Tindivo Entregas no está disponible ahora.",
    "maxWeightKg": 5,
    "maxActivePerPhone": 1,
    "departureTravelMin": 5
  }'::jsonb)
on conflict (key) do nothing;

-- `timers.courierAcceptMinutes` (15, decidido por Jesús — 03-plan-tecnico §2)
-- y `timers.courierWaitMinutes` (5, espera del motorizado en el punto A antes
-- de cancelar sin cobrar). Patrón idempotente de fusión (visto en 0043 para
-- `transferTtlSeconds`): no pisa la fila si ya tiene la clave.
update public.app_settings
  set value = value || '{"courierAcceptMinutes": 15}'::jsonb
  where key = 'timers' and not (value ? 'courierAcceptMinutes');

update public.app_settings
  set value = value || '{"courierWaitMinutes": 5}'::jsonb
  where key = 'timers' and not (value ? 'courierWaitMinutes');

-- `courier` entra a la whitelist de lectura pública (patrón 0193): el
-- checkout de Encargos necesita leer precio/horario/estado ANTES de que el
-- cliente inicie sesión (spec v1: "ve el precio S/ 3 antes de iniciar
-- sesión"). Se recrea la policy entera con la lista completa (idempotente).
drop policy if exists as_public_read on public.app_settings;
create policy as_public_read on public.app_settings for select to anon, authenticated
  using (key in (
    'platform_schedule',
    'support_phone',
    'support_whatsapp',
    'prepay_threshold',
    'delivery_bands',
    'coverage',
    'coverage_polygon',
    'location_validation',
    'terms_version',
    'max_cash_bill',
    'max_change',
    'timers',
    'courier'
  ));

-- ── 6 · Funciones ─────────────────────────────────────────────────────────────

-- Generador de short_id — mismo alfabeto que orders (invariante 1: se valida
-- SOLO al crear), unicidad comprobada contra courier_orders, no contra orders:
-- son espacios de nombres distintos y no hace falta que no choquen entre sí.
create or replace function public.generate_courier_short_id() returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_short_id text;
  v_i int;
  v_attempts int := 0;
begin
  loop
    v_short_id := '';
    for v_i in 1..8 loop
      v_short_id := v_short_id || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.courier_orders where short_id = v_short_id);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'No se pudo generar short_id único tras 20 intentos';
    end if;
  end loop;
  return v_short_id;
end;
$$;

-- ¿Dentro del horario de Tindivo Entregas ahora mismo? Todos los días, a
-- diferencia de `is_within_platform_schedule()` (mar-sáb). Única fuente de
-- verdad del horario — la usan tanto el guard de `create_courier_order` como
-- `public/courier/status` (vía RPC), para no repetir la regla en TS.
create or replace function public.is_within_courier_schedule() returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_start time;
  v_end time;
  v_t time;
begin
  select value -> 'hours' into v from public.app_settings where key = 'courier';
  if v is null then return false; end if;
  v_start := (v ->> 'start')::time;
  v_end := (v ->> 'end')::time;
  v_t := (now() at time zone 'America/Lima')::time;
  if v_end > v_start then
    return v_t >= v_start and v_t < v_end;
  else
    return v_t >= v_start or v_t < v_end; -- cruza medianoche
  end if;
end;
$$;
grant execute on function public.is_within_courier_schedule() to anon, authenticated, service_role;

-- ¿Hay al menos un motorizado disponible ahora?
create or replace function public.courier_has_available_driver() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.driver_availability da
    join public.drivers d on d.id = da.driver_id
    where da.is_available = true and d.is_active = true
  );
$$;
grant execute on function public.courier_has_available_driver() to anon, authenticated, service_role;

-- Estado público del servicio, sin sesión (`public/courier/status`).
create or replace function public.courier_service_status() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_enabled boolean;
begin
  select value into v_courier from public.app_settings where key = 'courier';
  v_enabled := coalesce((v_courier ->> 'enabled')::boolean, false);
  return jsonb_build_object(
    'enabled', v_enabled,
    'openNow', v_enabled
      and public.is_within_courier_schedule()
      and public.courier_has_available_driver(),
    'hours', v_courier -> 'hours',
    'price', coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00),
    'pausedMessage', v_courier ->> 'pausedMessage'
  );
end;
$$;
grant execute on function public.courier_service_status() to anon, authenticated, service_role;

-- Crea la solicitud. Idempotencia real la da `Idempotency-Key` en la capa API
-- (patrón `withIdempotency`); esta función es la única autoridad sobre las
-- guardas de negocio, para que ningún llamador (API de hoy, panel de mañana)
-- pueda saltárselas reimplementándolas en TS.
create or replace function public.create_courier_order(
  p_customer_user_id uuid,
  p_requester_name text,
  p_requester_phone text,
  p_directory_business_id uuid,
  p_origin_name text,
  p_origin_phone text,
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_origin_reference_text text,
  p_destination_name text,
  p_destination_phone text,
  p_destination_lat numeric,
  p_destination_lng numeric,
  p_destination_reference_text text,
  p_item_description text,
  p_is_fragile boolean,
  p_ready_in_min int,
  p_payer public.courier_payer,
  p_weight_confirmed boolean,
  p_prepaid_confirmed boolean,
  p_utm_source text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_max_active int;
  v_fee numeric(10,2);
  v_distance_m numeric(10,2);
  v_short_id text;
  v_id uuid;
  v_order_number bigint;
  v_active_count int;
begin
  if not p_weight_confirmed then
    raise exception 'Falta confirmar que lo que envías está permitido' using errcode = 'P0001';
  end if;
  if not p_prepaid_confirmed then
    raise exception 'Falta confirmar que ya pagaste tu pedido' using errcode = 'P0001';
  end if;

  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null or coalesce((v_courier ->> 'enabled')::boolean, false) = false then
    raise exception 'courier_disabled' using errcode = 'P0001';
  end if;

  if not public.is_within_courier_schedule() then
    raise exception 'courier_closed' using errcode = 'P0001';
  end if;

  if not public.courier_has_available_driver() then
    raise exception 'courier_no_driver' using errcode = 'P0001';
  end if;

  if not public.point_in_coverage_polygon(p_origin_lat, p_origin_lng) then
    raise exception 'courier_out_of_zone:origin' using errcode = 'P0001';
  end if;
  if not public.point_in_coverage_polygon(p_destination_lat, p_destination_lng) then
    raise exception 'courier_out_of_zone:destination' using errcode = 'P0001';
  end if;

  v_max_active := coalesce((v_courier ->> 'maxActivePerPhone')::int, 1);
  select count(*) into v_active_count
    from public.courier_orders
    where requester_phone = p_requester_phone
      and status not in ('delivered', 'cancelled');
  if v_active_count >= v_max_active then
    raise exception 'courier_active_limit' using errcode = 'P0001';
  end if;

  v_fee := coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00);
  v_distance_m := public.geo_distance_km(
    p_origin_lat::double precision, p_origin_lng::double precision,
    p_destination_lat::double precision, p_destination_lng::double precision
  ) * 1000;
  v_short_id := public.generate_courier_short_id();

  insert into public.courier_orders (
    short_id, customer_user_id, requester_name, requester_phone,
    directory_business_id,
    origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text,
    destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text,
    item_description, is_fragile, ready_in_min, ready_at,
    payer, fee_amount, distance_m, weight_confirmed, prepaid_confirmed,
    utm_source
  ) values (
    v_short_id, p_customer_user_id, p_requester_name, p_requester_phone,
    p_directory_business_id,
    p_origin_name, p_origin_phone, p_origin_lat, p_origin_lng, p_origin_reference_text,
    p_destination_name, p_destination_phone, p_destination_lat, p_destination_lng, p_destination_reference_text,
    p_item_description, p_is_fragile, p_ready_in_min, now() + (p_ready_in_min || ' minutes')::interval,
    p_payer, v_fee, v_distance_m, p_weight_confirmed, p_prepaid_confirmed,
    p_utm_source
  )
  returning id, order_number into v_id, v_order_number;

  insert into public.courier_order_events (courier_order_id, event_type, actor_role, actor_user_id, data)
  values (v_id, 'courier.requested', 'customer', p_customer_user_id,
    jsonb_build_object('feeAmount', v_fee, 'distanceM', v_distance_m));

  return jsonb_build_object(
    'id', v_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'requested',
    'feeAmount', v_fee,
    'distanceM', v_distance_m
  );
end;
$$;
grant execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text
) to service_role;

-- Avanza el estado. Acciones: accept, release, depart, arrive,
-- collect_transport, pick_up, depart_dropoff, deliver, cancel, report_problem.
-- `accept` es una sola sentencia condicionada a `status='requested' and
-- driver_id is null`: la carrera entre dos motorizados la resuelve la base
-- (invariante del repo), no un SELECT-then-UPDATE en dos pasos.
create or replace function public.advance_courier_order(
  p_courier_order_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_cancel_reason public.courier_cancel_reason default null,
  p_payment_method text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_row public.courier_orders;
  v_updated boolean := false;
begin
  select id into v_driver_id from public.drivers where user_id = p_actor_user_id;

  if p_action = 'accept' then
    if v_driver_id is null then
      raise exception 'courier_driver_not_found' using errcode = 'P0001';
    end if;
    update public.courier_orders
      set status = 'accepted', driver_id = v_driver_id, accepted_at = now()
      where id = p_courier_order_id and status = 'requested' and driver_id is null
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_already_taken' using errcode = 'P0001';
    end if;

  elsif p_action = 'release' then
    update public.courier_orders
      set status = 'requested', driver_id = null, accepted_at = null
      where id = p_courier_order_id and driver_id = v_driver_id
        and status in ('accepted', 'heading_to_pickup', 'at_pickup')
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_cannot_release' using errcode = 'P0001';
    end if;

  elsif p_action = 'depart' then
    update public.courier_orders
      set status = 'heading_to_pickup', departed_at = now()
      where id = p_courier_order_id and driver_id = v_driver_id and status = 'accepted'
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;

  elsif p_action = 'arrive' then
    update public.courier_orders
      set status = 'at_pickup', arrived_at = now()
      where id = p_courier_order_id and driver_id = v_driver_id and status = 'heading_to_pickup'
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;

  elsif p_action = 'collect_transport' then
    update public.courier_orders
      set transport_collected_at = now(), payment_method = p_payment_method
      where id = p_courier_order_id and driver_id = v_driver_id
        and status in ('at_pickup', 'picked_up', 'heading_to_dropoff')
        and transport_collected_at is null
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;

  elsif p_action = 'pick_up' then
    select * into v_row from public.courier_orders
      where id = p_courier_order_id and driver_id = v_driver_id and status = 'at_pickup';
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;
    -- Guarda de cobro: si paga quien entrega, tiene que haber cobrado ANTES
    -- de soltar el punto A (patrón `pick_up` de `create_customer_order`).
    if v_row.payer = 'origin' and v_row.transport_collected_at is null then
      raise exception 'courier_transport_unpaid' using errcode = 'P0001';
    end if;
    update public.courier_orders set status = 'picked_up', picked_up_at = now()
      where id = p_courier_order_id
      returning * into v_row;

  elsif p_action = 'depart_dropoff' then
    update public.courier_orders
      set status = 'heading_to_dropoff', departed_dropoff_at = now()
      where id = p_courier_order_id and driver_id = v_driver_id and status = 'picked_up'
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;

  elsif p_action = 'deliver' then
    select * into v_row from public.courier_orders
      where id = p_courier_order_id and driver_id = v_driver_id and status = 'heading_to_dropoff';
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;
    -- Guarda de cobro: si paga quien recibe, tiene que cobrar ANTES de
    -- entregar (el artículo no cambia de manos hasta cobrar, DECISIONS).
    if v_row.payer = 'destination' and v_row.transport_collected_at is null then
      raise exception 'courier_transport_unpaid' using errcode = 'P0001';
    end if;
    update public.courier_orders set status = 'delivered', delivered_at = now()
      where id = p_courier_order_id
      returning * into v_row;

  elsif p_action = 'cancel' then
    if p_cancel_reason is null then
      raise exception 'courier_cancel_reason_required' using errcode = 'P0001';
    end if;
    update public.courier_orders
      set status = 'cancelled', cancelled_at = now(), cancel_reason = p_cancel_reason
      where id = p_courier_order_id and status not in ('delivered', 'cancelled')
      returning * into v_row;
    if v_row.id is null then
      raise exception 'courier_invalid_transition' using errcode = 'P0001';
    end if;

  elsif p_action = 'report_problem' then
    -- No cambia estado: solo deja rastro (ej. "difícil de transportar").
    select * into v_row from public.courier_orders where id = p_courier_order_id;
    if v_row.id is null then
      raise exception 'courier_not_found' using errcode = 'P0002';
    end if;

  else
    raise exception 'courier_unknown_action' using errcode = 'P0001';
  end if;

  insert into public.courier_order_events (courier_order_id, event_type, actor_role, actor_user_id, data)
  values (
    p_courier_order_id,
    'courier.' || p_action,
    case when v_driver_id is not null then 'driver' else 'system' end,
    p_actor_user_id,
    jsonb_build_object('cancelReason', p_cancel_reason, 'paymentMethod', p_payment_method)
  );

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;
grant execute on function public.advance_courier_order(
  uuid, uuid, text, public.courier_cancel_reason, text
) to service_role;

-- Falla de seguridad: expira lo no aceptado a tiempo. Doble mecanismo, mismo
-- patrón que `cancel_expired_prepay_orders` (0174) — Inngest agenda el timer
-- preciso por solicitud (`apps/api/lib/inngest/functions.ts`), esto es el
-- failsafe idempotente por si ese aviso se pierde.
create or replace function public.expire_courier_orders() returns int
  language plpgsql security definer set search_path = ''
as $$
declare
  v_minutes int;
  v_count int;
begin
  select coalesce((value ->> 'courierAcceptMinutes')::int, 15) into v_minutes
    from public.app_settings where key = 'timers';

  with expired as (
    update public.courier_orders
      set status = 'cancelled', cancelled_at = now(), cancel_reason = 'no_driver'
      where status = 'requested' and created_at < now() - (v_minutes || ' minutes')::interval
      returning id
  )
  select count(*) into v_count from expired;

  if v_count > 0 then
    insert into public.courier_order_events (courier_order_id, event_type, actor_role, data)
    select id, 'courier.expired', 'system', '{}'::jsonb
    from public.courier_orders
    where status = 'cancelled' and cancel_reason = 'no_driver' and cancelled_at >= now() - interval '1 minute';
  end if;

  return v_count;
end;
$$;
grant execute on function public.expire_courier_orders() to anon, authenticated, service_role;

-- Cron failsafe, cada minuto. Guardado tras `pg_extension` (local puede no
-- tener pg_cron habilitado) — mismo patrón que 0174.
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-courier-orders') THEN
      PERFORM cron.unschedule('expire-courier-orders');
    END IF;
    PERFORM cron.schedule('expire-courier-orders', '* * * * *',
      'SELECT public.expire_courier_orders();');
  END IF;
END
$mig$;

-- Seguimiento público sin sesión (`public/courier/[shortId]`), ventana 24h
-- post-entrega — mismo patrón que `get_tracking`. No expone teléfonos (PII).
create or replace function public.get_courier_tracking(p_short_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'shortId', co.short_id,
    'orderNumber', co.order_number,
    'status', co.status,
    'originName', co.origin_name,
    'destinationName', co.destination_name,
    'itemDescription', co.item_description,
    'feeAmount', co.fee_amount,
    'payer', co.payer,
    'readyAt', co.ready_at,
    'driverName', d.full_name,
    'createdAt', co.created_at,
    'acceptedAt', co.accepted_at,
    'pickedUpAt', co.picked_up_at,
    'deliveredAt', co.delivered_at,
    'cancelledAt', co.cancelled_at,
    'cancelReason', co.cancel_reason
  )
  into v_result
  from public.courier_orders co
  left join public.drivers d on d.id = co.driver_id
  where co.short_id = p_short_id
    and (co.delivered_at is null or co.delivered_at > now() - interval '24 hours');
  return v_result;
end;
$$;
grant execute on function public.get_courier_tracking(text) to anon, authenticated, service_role;
