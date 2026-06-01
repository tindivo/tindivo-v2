-- =============================================================================
-- 0002 · Tablas
-- Idempotente (CREATE ... IF NOT EXISTS). Money decimal(10,2), coords decimal(10,7).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- CORE: identidad y actores
-- ----------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key,                                  -- = auth.users.id
  email text unique not null,
  full_name text,
  primary_role public.user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is 'Proxy de auth.users con rol primario y flags de dominio.';
create index if not exists users_primary_role_idx on public.users (primary_role);

create table if not exists public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Roles activos por usuario (multi-rol desde el día 1).';

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  coordinates_lat decimal(10,7),
  coordinates_lng decimal(10,7),

  -- Capacidades granulares combinables (4 dimensiones ortogonales)
  publishes_catalog boolean not null default false,
  accepts_web_pickup boolean not null default false,
  accepts_web_delivery boolean not null default false,
  uses_tindivo_drivers boolean not null default false,
  primary_capability public.business_primary_capability,  -- derivada por trigger

  -- Pago Yape/Plin
  yape_number text,
  plin_number text,
  qr_url text,

  -- Identidad visual
  accent_color text not null default 'f97316',            -- hex sin #
  logo_url text,
  banner_url text,
  tagline text,
  categoria text[] default array[]::text[],               -- hasta 2

  -- Operativo
  estimated_eta_min int not null default 25,
  estimated_eta_max int not null default 35,
  delivery_fee decimal(10,2) not null default 2.00,       -- lo que cobra el negocio al cliente

  -- Overrides de comisión (null = usa app_settings.commissions) — 2 bandas + pickup
  commission_override_near decimal(10,2),
  commission_override_far decimal(10,2),
  commission_override_pickup decimal(10,2),

  -- Estado / mora
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  blocked_for_debt boolean not null default false,    -- flag estructurado (no parsear block_reason)
  block_reason text,
  balance_due decimal(10,2) not null default 0.00,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_settlement_at timestamptz,
  last_payment_at timestamptz,

  constraint accent_color_format check (accent_color ~ '^[0-9a-f]{6}$'),
  constraint capabilities_consistent check (
    (not accepts_web_pickup or publishes_catalog)
    and (not accepts_web_delivery or (publishes_catalog and uses_tindivo_drivers))
    and (not publishes_catalog or accepts_web_pickup or accepts_web_delivery)
  )
);
comment on table public.businesses is 'Negocios afiliados. Capacidades combinables determinan la UI de negocios.tindivo.com.';
create unique index if not exists businesses_accent_color_active_idx on public.businesses (accent_color) where is_active = true;
create index if not exists businesses_user_id_idx on public.businesses (user_id);
create index if not exists businesses_active_idx on public.businesses (is_active, is_blocked);
create index if not exists businesses_publishes_catalog_idx on public.businesses (publishes_catalog) where publishes_catalog = true;
create index if not exists businesses_primary_capability_idx on public.businesses (primary_capability);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  vehicle_type public.vehicle_type not null default 'moto',
  license_plate text,
  operating_days text[] not null default array['tue','wed','thu','fri','sat']::text[],
  shift_start text not null default '18:00',
  shift_end text not null default '23:00',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.drivers is 'Motorizados contratados por Tindivo (sueldo fijo).';
create index if not exists drivers_user_id_idx on public.drivers (user_id);
create index if not exists drivers_active_idx on public.drivers (is_active);

create table if not exists public.driver_availability (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  is_available boolean not null default false,
  shift_started_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.driver_availability is 'Disponibilidad actual del motorizado durante su turno.';

create table if not exists public.driver_restaurants (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.users(id),
  primary key (driver_id, business_id)
);
comment on table public.driver_restaurants is 'Negocios que cada motorizado está autorizado a atender.';
create index if not exists driver_restaurants_business_idx on public.driver_restaurants (business_id);

create table if not exists public.customer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name text not null,
  phone text,
  default_address text,
  default_reference text,
  default_coordinates_lat decimal(10,7),
  default_coordinates_lng decimal(10,7),
  default_location_accuracy_m int,
  phone_verified_at timestamptz,
  strikes int not null default 0,                         -- contador rápido (autoritativo: customer_strikes)
  contraentrega_blocked boolean not null default false,   -- 2 strikes -> solo prepago
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.customer_profiles is 'Perfil del cliente final registrado en tindivo.com.';

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null default 'Casa',
  line text,
  reference text not null,                                -- mín 20 / máx 140 (validado en app)
  coordinates_lat decimal(10,7),
  coordinates_lng decimal(10,7),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_addresses_user_idx on public.customer_addresses (user_id);
create unique index if not exists customer_addresses_default_per_user_idx on public.customer_addresses (user_id) where is_default = true;

-- Strikes anclados a número Y dirección (cambiar uno no limpia el otro). 2 -> bloqueo.
create table if not exists public.customer_strikes (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.users(id) on delete set null,  -- null si manual
  phone text not null,
  delivery_reference text,                                -- ancla de dirección
  delivery_coordinates_lat decimal(10,7),
  delivery_coordinates_lng decimal(10,7),
  order_id uuid,                                          -- FK añadida tras crear orders
  reason text not null default 'no_show',
  reported_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
comment on table public.customer_strikes is 'Strikes anti-fraude anclados a número Y dirección. 2 strikes -> contraentrega bloqueada.';
create index if not exists customer_strikes_phone_idx on public.customer_strikes (phone);
create index if not exists customer_strikes_address_idx on public.customer_strikes (delivery_reference);

create table if not exists public.terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);
comment on table public.terms_acceptance is 'Aceptación de Términos+Privacidad (Ley 29733).';

create table if not exists public.business_schedule (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0 = domingo
  is_open boolean not null default true,
  shift1_start text,
  shift1_end text,
  shift2_start text,
  shift2_end text,
  crosses_midnight boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (business_id, day_of_week)
);
comment on table public.business_schedule is 'Horario por negocio (7 días, hasta 2 turnos, cross-medianoche).';

-- ----------------------------------------------------------------------------
-- ORDERS y dominio operativo
-- ----------------------------------------------------------------------------

create sequence if not exists public.order_number_seq;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null default nextval('public.order_number_seq'),  -- atómico, NUNCA Date.now()
  short_id text unique not null,

  business_id uuid not null references public.businesses(id),
  driver_id uuid references public.drivers(id),
  customer_user_id uuid references public.users(id),
  source public.order_source not null default 'business_manual',
  is_manual boolean generated always as (source = 'business_manual') stored,

  -- Datos del cliente
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_reference text,
  delivery_coordinates_lat decimal(10,7),
  delivery_coordinates_lng decimal(10,7),
  delivery_maps_url text,
  delivery_method public.delivery_method not null default 'delivery',
  delivery_distance_band public.distance_band,            -- declarado en picked_up

  -- Pago (delivery_fee lo setea el backend desde app_settings.delivery_bands según banda)
  order_amount decimal(10,2) not null,
  delivery_fee decimal(10,2) not null,
  payment_intent public.payment_intent not null,
  payment_real public.payment_real,
  yape_amount decimal(10,2),
  cash_amount decimal(10,2),
  client_pays_with decimal(10,2),
  change_to_give decimal(10,2),
  yape_confirmed boolean not null default false,
  cash_owed_at_delivery decimal(10,2),
  tindivo_commission decimal(10,2),                       -- snapshot al delivered_at
  comprobante_prepago_url text,                           -- storage (bucket payment-proofs)

  -- Tiempos
  prep_time_minutes int,
  estimated_ready_at timestamptz,
  appears_in_queue_at timestamptz,
  prep_extended_at timestamptz,
  prep_extension_count int not null default 0 check (prep_extension_count between 0 and 2),
  ready_early_used boolean not null default false,

  -- Capacidad mochila (modelado; UI de slots fuera de Fase 1)
  occupancy_slots int not null default 1 check (occupancy_slots between 1 and 3),

  -- Estado y urgencia
  status public.order_status not null default 'pending_acceptance',
  urgent_since timestamptz,
  assigned_at timestamptz,

  -- Timestamps de transición (alineados a la máquina de estados canónica)
  validating_at timestamptz,
  pending_acceptance_at timestamptz,
  confirmed_at timestamptz,
  preparing_at timestamptz,
  waiting_driver_at timestamptz,
  heading_at timestamptz,
  waiting_at_restaurant_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id),
  cancel_reason public.cancel_reason,
  cancel_note text,

  -- Tracking compartido
  tracking_link_sent_at timestamptz,
  tracking_link_sent_by uuid references public.users(id),

  -- Notas
  customer_notes text,
  business_notes text,
  driver_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_short_id_format check (short_id ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$')
);
comment on table public.orders is 'Pedidos — agregado central del dominio.';
create index if not exists orders_business_idx on public.orders (business_id, created_at desc);
create index if not exists orders_driver_idx on public.orders (driver_id, created_at desc) where driver_id is not null;
create index if not exists orders_customer_idx on public.orders (customer_user_id, created_at desc) where customer_user_id is not null;
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_short_id_idx on public.orders (short_id);
create index if not exists orders_customer_phone_idx on public.orders (customer_phone);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_urgent_idx on public.orders (urgent_since) where urgent_since is not null;
create index if not exists orders_waiting_queue_idx on public.orders (appears_in_queue_at) where status = 'waiting_driver' and driver_id is null;
create index if not exists orders_business_status_idx on public.orders (business_id, status);
create index if not exists orders_delivered_at_idx on public.orders (delivered_at) where status = 'delivered';

-- FK diferida de customer_strikes -> orders
do $$ begin
  alter table public.customer_strikes
    add constraint customer_strikes_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  changed_by uuid references public.users(id),
  notes text,
  changed_at timestamptz not null default now()
);
comment on table public.order_status_history is 'Historial inmutable de cambios de estado por pedido.';
create index if not exists osh_order_idx on public.order_status_history (order_id, changed_at desc);

-- Auditoría de negocio (no negociable desde día 1). Distinto de domain_events (outbox técnico).
create table if not exists public.order_event_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_role text,                                        -- cliente/restaurante/motorizado/admin/sistema
  actor_user_id uuid references public.users(id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.order_event_log is 'Log de auditoría de negocio por pedido (reconstrucción de cualquier caso).';
create index if not exists oel_order_idx on public.order_event_log (order_id, created_at);

create table if not exists public.order_assignment_rejections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  reason text,
  rejected_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
comment on table public.order_assignment_rejections is 'Rechazos de asignación (TTL 6h). Modelado; asignación auto fuera de Fase 1.';
create index if not exists oar_order_idx on public.order_assignment_rejections (order_id);
create index if not exists oar_driver_expires_idx on public.order_assignment_rejections (driver_id, expires_at);

create table if not exists public.order_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_driver_id uuid not null references public.drivers(id),
  to_driver_id uuid not null references public.drivers(id),
  status public.transfer_request_status not null default 'pending',
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
comment on table public.order_transfer_requests is 'Transferencias driver->driver (TTL 30s). Modelado; UI fuera de Fase 1.';
create index if not exists otr_order_idx on public.order_transfer_requests (order_id);
create unique index if not exists otr_one_pending_per_pair_idx on public.order_transfer_requests (order_id, to_driver_id) where status = 'pending';

-- ----------------------------------------------------------------------------
-- CATÁLOGO (menú)
-- ----------------------------------------------------------------------------

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  blurb text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_categories_business_idx on public.menu_categories (business_id, display_order);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  base_price decimal(10,2) not null,
  image_url text,
  image_hue int,
  display_order int not null default 0,
  is_available boolean not null default true,
  is_compact boolean not null default false,
  badges text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_category_idx on public.menu_items (category_id, display_order);
create index if not exists menu_items_business_available_idx on public.menu_items (business_id, is_available);

create table if not exists public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  selection_type text not null check (selection_type in ('single','multi')),
  is_required boolean not null default false,
  min_selections int not null default 0,
  max_selections int,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
  name text not null,
  description text,
  additional_price decimal(10,2) not null default 0.00,
  display_order int not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists menu_modifier_options_group_idx on public.menu_modifier_options (group_id, display_order);

create table if not exists public.menu_item_modifier_groups (
  item_id uuid not null references public.menu_items(id) on delete cascade,
  group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
  display_order int not null default 0,
  primary key (item_id, group_id)
);

create table if not exists public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  item_name_snapshot text not null,
  base_price_snapshot decimal(10,2) not null,
  quantity int not null default 1,
  unit_price decimal(10,2) not null,
  line_total decimal(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists coi_order_idx on public.customer_order_items (order_id);

create table if not exists public.customer_order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.customer_order_items(id) on delete cascade,
  group_name_snapshot text not null,
  option_name_snapshot text not null,
  additional_price_snapshot decimal(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists coim_item_idx on public.customer_order_item_modifiers (item_id);

-- ----------------------------------------------------------------------------
-- BILLING
-- ----------------------------------------------------------------------------

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  period_start date not null,
  period_end date not null,
  order_count int not null default 0,
  total_amount decimal(10,2) not null default 0.00,
  status public.settlement_status not null default 'pending',
  due_date date not null,
  paid_at timestamptz,
  paid_by uuid references public.users(id),
  payment_method text,
  payment_note text,
  excluded_reason text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, period_start, period_end)
);
comment on table public.settlements is 'Liquidación semanal de comisiones (negocio->Tindivo). Generación manual del admin.';
create index if not exists settlements_status_idx on public.settlements (status);
create index if not exists settlements_business_idx on public.settlements (business_id, period_end desc);

create table if not exists public.cash_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  driver_id uuid not null references public.drivers(id),
  settlement_date date not null,
  total_cash decimal(10,2) not null default 0.00,
  order_count int not null default 0,
  status public.cash_settlement_status not null default 'pending',
  delivered_amount decimal(10,2),
  delivered_at_ts timestamptz,
  confirmed_amount decimal(10,2),
  confirmed_at timestamptz,
  confirmed_by uuid references public.users(id),
  reported_amount decimal(10,2),
  dispute_note text,
  disputed_at timestamptz,
  resolved_amount decimal(10,2),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, driver_id, settlement_date)
);
comment on table public.cash_settlements is 'Liquidación diaria de efectivo (motorizado->negocio).';
create index if not exists cs_status_idx on public.cash_settlements (status);
create index if not exists cs_date_idx on public.cash_settlements (settlement_date desc);

create table if not exists public.restaurant_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  settlement_id uuid references public.settlements(id),
  amount decimal(10,2) not null,
  payment_method text not null,
  paid_at timestamptz not null,
  registered_by uuid references public.users(id),
  note text,
  created_at timestamptz not null default now()
);
comment on table public.restaurant_payments is 'Pagos del negocio a Tindivo (registrados por admin).';
create index if not exists rp_business_idx on public.restaurant_payments (business_id, paid_at desc);

-- Fondo de contingencia: registro contable de devoluciones inmediatas.
create table if not exists public.contingency_advances (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_user_id uuid references public.users(id),
  customer_phone text,
  amount decimal(10,2) not null,
  reason text not null,
  proof_url text,                                         -- captura Yape/Plin (storage)
  actor_charged public.contingency_actor_charged not null,
  status public.contingency_advance_status not null default 'activo',
  disputed_at timestamptz,
  dispute_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id),
  operator uuid references public.users(id),              -- admin que registró
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contingency_advances is 'Adelantos del fondo de contingencia (disputable 48h).';
create index if not exists ca_order_idx on public.contingency_advances (order_id);
create index if not exists ca_status_idx on public.contingency_advances (status);

-- Bandeja del admin (6 tipos de reporte).
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  type public.report_type not null,
  status public.report_status not null default 'open',
  order_id uuid references public.orders(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  customer_user_id uuid references public.users(id) on delete set null,
  customer_phone text,
  description text,
  evidence_url text,
  resolution_note text,
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.reports is 'Bandeja del admin: 6 tipos de reporte, resolución humana caso a caso.';
create index if not exists reports_open_idx on public.reports (created_at desc) where status = 'open';
create index if not exists reports_type_idx on public.reports (type, status);

-- ----------------------------------------------------------------------------
-- INFRAESTRUCTURA
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_successful_at timestamptz,
  last_failed_at timestamptz,
  failure_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
comment on table public.push_subscriptions is 'Suscripciones Web Push VAPID (multi-dispositivo). RLS activada (corrige bug v1).';
create index if not exists ps_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  event_type text not null,
  status text not null check (status in ('ok','error')),
  error_code int,
  error_message text,
  at timestamptz not null default now()
);
comment on table public.push_delivery_log is 'Log de envíos Web Push (retención 30d). RLS admin-only.';
create index if not exists pdl_at_idx on public.push_delivery_log (at desc);
create index if not exists pdl_status_idx on public.push_delivery_log (status, at desc);

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  retry_count int not null default 0,
  last_error text
);
comment on table public.domain_events is 'Outbox de eventos de dominio. El dispatch (push/Inngest) se cablea en Fase 2.';
create index if not exists de_aggregate_idx on public.domain_events (aggregate_type, aggregate_id, occurred_at desc);
create index if not exists de_unpublished_idx on public.domain_events (occurred_at) where published_at is null;
create index if not exists de_event_type_idx on public.domain_events (event_type, occurred_at desc);

create table if not exists public.idempotency_keys (
  key uuid not null,
  scope text not null,
  user_id uuid not null,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  status text not null default 'reserved' check (status in ('reserved','completed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (key, scope)
);
comment on table public.idempotency_keys is 'Idempotencia estilo Stripe para POSTs de creación (TTL 24h).';
create index if not exists ik_expires_idx on public.idempotency_keys (expires_at);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
comment on table public.admin_alerts is 'Alertas operativas para el admin (Realtime).';
create index if not exists aa_unresolved_idx on public.admin_alerts (created_at desc) where resolved_at is null;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);
comment on table public.app_settings is 'Configuración global editable por admin (el admin configura, no el código).';

-- NOTA: el listado público del marketplace (negocios publicados, columnas
-- seguras) se sirve vía apps/api (/api/v1/public/businesses) con service_role,
-- NO vía una vista/tabla expuesta a anon. RLS filtra filas pero no columnas, y
-- una vista SECURITY DEFINER dispara el advisor; servir por API es la opción
-- limpia y alineada con el modelo "REST-everything" (ver DECISIONS §12/§13).
