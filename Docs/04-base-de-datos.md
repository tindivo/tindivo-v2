# 04 · Base de datos

> Schema completo SQL del nuevo proyecto Supabase. Enums, tablas, RLS policies, triggers, índices, publicación realtime, retención. Pensado para ejecutarse limpio desde una instancia Supabase nueva.

---

## Tabla de contenidos

- [1. Convenciones](#1-convenciones)
- [2. Enums](#2-enums)
- [3. Tablas core](#3-tablas-core)
- [4. Tablas de orders y dominio operativo](#4-tablas-de-orders-y-dominio-operativo)
- [5. Tablas de catálogo (menú)](#5-tablas-de-catálogo-menú)
- [6. Tablas de billing](#6-tablas-de-billing)
- [7. Tablas de notificaciones e infraestructura](#7-tablas-de-notificaciones-e-infraestructura)
- [8. Helper functions](#8-helper-functions)
- [9. Triggers de dominio](#9-triggers-de-dominio)
- [10. RLS policies completas](#10-rls-policies-completas)
- [11. Índices](#11-índices)
- [12. Publicación realtime](#12-publicación-realtime)
- [13. Storage buckets](#13-storage-buckets)
- [14. pg_cron schedule](#14-pg_cron-schedule)
- [15. Retención de datos](#15-retención-de-datos)
- [16. Seed inicial](#16-seed-inicial)

---

## 1. Convenciones

- **Tablas**: `snake_case`, plural (`orders`, `businesses`, `push_subscriptions`).
- **Columnas**: `snake_case`. Timestamps con sufijo `_at`. Booleans con prefijo `is_` o `has_`.
- **Enums**: `snake_case` valor (`waiting_driver`, `pending_cash`).
- **PKs**: `uuid PRIMARY KEY DEFAULT gen_random_uuid()` (excepto `users.id` que coincide con `auth.users.id`).
- **FKs**: `<table>_id` (e.g., `business_id`). Soft delete cascade donde aplica.
- **Audit columns**: `created_at`, `updated_at` en todas las tablas mutables (default `now()`).
- **Money**: `decimal(10,2)` SIEMPRE. Jamás float.
- **Decimal coords**: `decimal(10,7)` para lat/lng.
- **Comments**: cada tabla tiene `COMMENT ON TABLE` explicativo.

---

## 2. Enums

```sql
-- Roles del sistema
CREATE TYPE user_role AS ENUM (
  'customer',
  'business',
  'driver',
  'admin'
);

-- Estados de pedido
CREATE TYPE order_status AS ENUM (
  'pending_acceptance',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
  'delivered',
  'cancelled'
);

-- Método de pago (intent al crear)
CREATE TYPE payment_status AS ENUM (
  'prepaid',
  'pending_yape',
  'pending_cash',
  'pending_mixed'
);

-- Origen del pedido
CREATE TYPE order_source AS ENUM (
  'customer_pwa',
  'business_manual',
  'driver_manual'
);

-- Tipo de entrega
CREATE TYPE delivery_method AS ENUM (
  'delivery',
  'pickup'
);

-- Banda de distancia
CREATE TYPE delivery_distance_band AS ENUM (
  'near',
  'medium',
  'far'
);

-- Estado liquidación semanal comisión
CREATE TYPE settlement_status AS ENUM (
  'pending',
  'paid',
  'overdue',
  'cancelled'
);

-- Estado liquidación diaria efectivo
CREATE TYPE cash_settlement_status AS ENUM (
  'pending',
  'pending_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'auto_assumed_confirmed'
);

-- Vehículos
CREATE TYPE vehicle_type AS ENUM (
  'moto',
  'bicicleta',
  'pie',
  'auto'
);

-- Capacidad primaria de negocio (derivada de los 4 flags booleanos)
CREATE TYPE business_primary_capability AS ENUM (
  'drivers_only',      -- pedidos manuales del cajero con motorizado Tindivo, sin catálogo web
  'catalog_pickup',    -- catálogo público, solo cliente recoge en local (sin drivers)
  'catalog_delivery',  -- catálogo público, solo delivery con drivers Tindivo
  'catalog_full',      -- catálogo público, cliente elige pickup o delivery
  'pickup_local'       -- registro manual del cajero, sin web ni drivers (cliente va al local)
);

-- Estado transferencia entre drivers
CREATE TYPE transfer_request_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'expired',
  'invalidated'
);
```

---

## 3. Tablas core

### users (extensión de auth.users)

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,                             -- coincide con auth.users.id
  email text UNIQUE NOT NULL,
  full_name text,
  primary_role user_role NOT NULL DEFAULT 'customer',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE users IS 'Proxy de auth.users con rol primario y flags de dominio Tindivo.';
CREATE INDEX users_primary_role_idx ON users (primary_role);
```

### user_roles (multi-rol)

```sql
CREATE TABLE user_roles (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  granted_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
COMMENT ON TABLE user_roles IS 'Roles activos por usuario. Un usuario puede tener N roles (cliente + business, business + driver, etc).';
```

### businesses

```sql
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  delivery_address_coordinates_lat decimal(10,7),
  delivery_address_coordinates_lng decimal(10,7),

  -- Capacidades granulares combinables (4 dimensiones ortogonales)
  publishes_catalog boolean DEFAULT false,         -- menú visible en tindivo.com
  accepts_web_pickup boolean DEFAULT false,        -- cliente puede ordenar pickup web (recoge en local)
  accepts_web_delivery boolean DEFAULT false,      -- cliente puede ordenar delivery web (Tindivo entrega)
  uses_tindivo_drivers boolean DEFAULT false,      -- usa motorizados para web delivery y/o pedidos manuales
  primary_capability business_primary_capability,  -- derivada al onboarding o al cambio

  -- Pago Yape
  yape_number text,
  qr_url text,

  -- Identidad visual
  accent_color text DEFAULT 'f97316',              -- hex sin #
  logo_url text,
  banner_url text,
  tagline text,

  -- Operativo
  estimated_eta_min int DEFAULT 25,
  estimated_eta_max int DEFAULT 35,
  delivery_fee decimal(10,2) DEFAULT 2.00,         -- lo que cobra el negocio al cliente (no Tindivo)

  -- Comisiones (override del default por si hay descuentos especiales)
  commission_override_pickup decimal(10,2),
  commission_override_near decimal(10,2),
  commission_override_medium decimal(10,2),
  commission_override_far decimal(10,2),

  -- Estado
  is_active boolean DEFAULT true,
  is_blocked boolean DEFAULT false,
  block_reason text,
  balance_due decimal(10,2) DEFAULT 0.00,

  -- Auditoría
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_settlement_at timestamptz,
  last_payment_at timestamptz,

  CONSTRAINT accent_color_format CHECK (accent_color ~ '^[0-9a-f]{6}$'),
  CONSTRAINT capabilities_consistent CHECK (
    -- accepts_web_pickup requiere publishes_catalog
    (NOT accepts_web_pickup OR publishes_catalog)
    -- accepts_web_delivery requiere publishes_catalog + uses_tindivo_drivers
    AND (NOT accepts_web_delivery OR (publishes_catalog AND uses_tindivo_drivers))
    -- Si publica catálogo, debe aceptar al menos una modalidad web
    AND (NOT publishes_catalog OR accepts_web_pickup OR accepts_web_delivery)
  )
);

-- Función helper para derivar primary_capability automáticamente
CREATE OR REPLACE FUNCTION derive_business_primary_capability(
  p_publishes_catalog boolean,
  p_accepts_web_pickup boolean,
  p_accepts_web_delivery boolean,
  p_uses_tindivo_drivers boolean
) RETURNS business_primary_capability AS $$
BEGIN
  IF NOT p_publishes_catalog THEN
    IF p_uses_tindivo_drivers THEN
      RETURN 'drivers_only'::business_primary_capability;
    ELSE
      RETURN 'pickup_local'::business_primary_capability;
    END IF;
  END IF;
  -- publica catálogo
  IF p_accepts_web_pickup AND p_accepts_web_delivery THEN
    RETURN 'catalog_full'::business_primary_capability;
  ELSIF p_accepts_web_delivery THEN
    RETURN 'catalog_delivery'::business_primary_capability;
  ELSE
    RETURN 'catalog_pickup'::business_primary_capability;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger que recalcula primary_capability ante cualquier cambio de capacidades
CREATE OR REPLACE FUNCTION update_business_primary_capability() RETURNS trigger AS $$
BEGIN
  NEW.primary_capability := derive_business_primary_capability(
    NEW.publishes_catalog,
    NEW.accepts_web_pickup,
    NEW.accepts_web_delivery,
    NEW.uses_tindivo_drivers
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_businesses_derive_primary_capability
  BEFORE INSERT OR UPDATE OF publishes_catalog, accepts_web_pickup, accepts_web_delivery, uses_tindivo_drivers
  ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_business_primary_capability();
COMMENT ON TABLE businesses IS 'Negocios (restaurantes / locales) afiliados al servicio. Capacidades combinables determinan UI en negocios.tindivo.com.';
CREATE UNIQUE INDEX businesses_accent_color_active_idx
  ON businesses (accent_color)
  WHERE is_active = true;
CREATE INDEX businesses_user_id_idx ON businesses (user_id);
CREATE INDEX businesses_active_idx ON businesses (is_active, is_blocked);
CREATE INDEX businesses_publishes_catalog_idx ON businesses (publishes_catalog) WHERE publishes_catalog = true;
CREATE INDEX businesses_web_pickup_idx ON businesses (accepts_web_pickup) WHERE accepts_web_pickup = true;
CREATE INDEX businesses_web_delivery_idx ON businesses (accepts_web_delivery) WHERE accepts_web_delivery = true;
CREATE INDEX businesses_primary_capability_idx ON businesses (primary_capability);
```

### drivers

```sql
CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  vehicle_type vehicle_type DEFAULT 'moto',
  license_plate text,
  operating_days text[] DEFAULT ARRAY['tue','wed','thu','fri','sat']::text[],
  shift_start text NOT NULL DEFAULT '18:00',       -- HH:MM
  shift_end text NOT NULL DEFAULT '23:00',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE drivers IS 'Motorizados / repartidores contratados por Tindivo.';
CREATE INDEX drivers_user_id_idx ON drivers (user_id);
CREATE INDEX drivers_active_idx ON drivers (is_active);
```

### driver_availability

```sql
CREATE TABLE driver_availability (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  is_available boolean DEFAULT false,
  shift_started_at timestamptz,                    -- cuando se puso disponible
  last_seen_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE driver_availability IS 'Estado actual de disponibilidad del driver durante su turno.';
```

### driver_restaurants (autorización por negocio)

```sql
CREATE TABLE driver_restaurants (
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES users(id),
  PRIMARY KEY (driver_id, business_id)
);
COMMENT ON TABLE driver_restaurants IS 'Negocios que cada motorizado está autorizado a atender. Filtra candidates de R1-R5 y muestra Equipo.';
CREATE INDEX driver_restaurants_business_idx ON driver_restaurants (business_id);
```

### customer_profiles

```sql
CREATE TABLE customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  default_address text,
  default_reference text,
  default_coordinates_lat decimal(10,7),
  default_coordinates_lng decimal(10,7),
  default_location_accuracy_m int,
  phone_verified_at timestamptz,                   -- post-MVP
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE customer_profiles IS 'Perfil del cliente final registrado en tindivo.com.';
```

### customer_addresses

```sql
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Casa',              -- 'Casa' | 'Trabajo' | 'Otro'
  line text,
  reference text NOT NULL,
  coordinates_lat decimal(10,7),
  coordinates_lng decimal(10,7),
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX customer_addresses_user_idx ON customer_addresses (user_id);
CREATE UNIQUE INDEX customer_addresses_default_per_user_idx
  ON customer_addresses (user_id)
  WHERE is_default = true;
```

---

## 4. Tablas de orders y dominio operativo

### orders

```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id text UNIQUE NOT NULL,                   -- 8 chars alfanumérico

  -- Relaciones
  business_id uuid NOT NULL REFERENCES businesses(id),
  driver_id uuid REFERENCES drivers(id),
  customer_user_id uuid REFERENCES users(id),      -- null si manual del cajero
  source order_source NOT NULL DEFAULT 'business_manual',

  -- Datos del cliente
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_reference text,
  delivery_coordinates_lat decimal(10,7),
  delivery_coordinates_lng decimal(10,7),
  delivery_maps_url text,
  delivery_method delivery_method NOT NULL DEFAULT 'delivery',
  delivery_distance_band delivery_distance_band,   -- declarado en picked_up

  -- Pago
  order_amount decimal(10,2) NOT NULL,
  delivery_fee decimal(10,2) NOT NULL DEFAULT 2.00,
  payment_status payment_status NOT NULL,
  payment_status_real payment_status,              -- método al entregar (puede cambiar)
  yape_amount decimal(10,2),                       -- si pending_mixed
  cash_amount decimal(10,2),                       -- si pending_cash o pending_mixed
  client_pays_with decimal(10,2),
  change_to_give decimal(10,2),
  yape_confirmed boolean DEFAULT false,
  cash_owed_at_delivery decimal(10,2),
  tindivo_commission decimal(10,2),                -- snapshot al delivered_at

  -- Tiempos
  prep_time_minutes int NOT NULL,
  estimated_ready_at timestamptz NOT NULL,
  appears_in_queue_at timestamptz NOT NULL,        -- 10 min antes (o now si prep<=10)
  accept_countdown_seconds int DEFAULT 90,
  prep_extended_at timestamptz,
  prep_extension_minutes int,                      -- 5 o 10
  ready_early_used boolean DEFAULT false,
  extension_used boolean DEFAULT false,

  -- Capacidad mochila
  occupancy_slots int NOT NULL DEFAULT 1 CHECK (occupancy_slots BETWEEN 1 AND 3),

  -- Estado y urgencia
  status order_status NOT NULL DEFAULT 'waiting_driver',
  urgent_since timestamptz,
  assigned_at timestamptz,

  -- Timestamps de transición
  pending_acceptance_at timestamptz,
  restaurant_accepted_at timestamptz,
  accepted_at timestamptz,
  heading_at timestamptz,
  waiting_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancel_reason text,

  -- Tracking compartido
  tracking_link_sent_at timestamptz,
  tracking_link_sent_by uuid REFERENCES users(id),

  -- Notas
  customer_notes text,
  business_notes text,
  driver_notes text,

  -- Auditoría
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE orders IS 'Pedidos — agregado central del dominio.';

-- Índices críticos
CREATE INDEX orders_business_idx ON orders (business_id, created_at DESC);
CREATE INDEX orders_driver_idx ON orders (driver_id, created_at DESC) WHERE driver_id IS NOT NULL;
CREATE INDEX orders_customer_idx ON orders (customer_user_id, created_at DESC) WHERE customer_user_id IS NOT NULL;
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_short_id_idx ON orders (short_id);
CREATE INDEX orders_customer_phone_idx ON orders (customer_phone);
CREATE INDEX orders_appears_in_queue_idx ON orders (appears_in_queue_at) WHERE status = 'waiting_driver';
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE INDEX orders_urgent_idx ON orders (urgent_since) WHERE urgent_since IS NOT NULL;
CREATE INDEX orders_active_partial_idx
  ON orders (business_id, status)
  WHERE status IN ('waiting_driver','heading_to_restaurant','waiting_at_restaurant','picked_up');
```

### order_status_history

```sql
CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_by uuid REFERENCES users(id),
  notes text,
  changed_at timestamptz DEFAULT now()
);
COMMENT ON TABLE order_status_history IS 'Historial inmutable de cambios de estado por pedido.';
CREATE INDEX osh_order_idx ON order_status_history (order_id, changed_at DESC);
```

### order_assignment_rejections

```sql
CREATE TABLE order_assignment_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  reason text,
  rejected_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '6 hours'
);
COMMENT ON TABLE order_assignment_rejections IS 'Rechazos de asignación por driver. TTL 6h. Suman a totalAssignedDay en R4 para penalizar.';
CREATE INDEX oar_order_idx ON order_assignment_rejections (order_id);
CREATE INDEX oar_driver_expires_idx ON order_assignment_rejections (driver_id, expires_at);
```

### order_transfer_requests

```sql
CREATE TABLE order_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_driver_id uuid NOT NULL REFERENCES drivers(id),     -- dueño actual
  to_driver_id uuid NOT NULL REFERENCES drivers(id),       -- solicitante
  status transfer_request_status NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
COMMENT ON TABLE order_transfer_requests IS 'Solicitudes de transferencia driver→driver. TTL 30s. Timeout-as-accept.';
CREATE INDEX otr_order_idx ON order_transfer_requests (order_id);
CREATE INDEX otr_pending_idx ON order_transfer_requests (status, created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX otr_one_pending_per_pair_idx
  ON order_transfer_requests (order_id, to_driver_id)
  WHERE status = 'pending';
```

---

## 5. Tablas de catálogo (menú)

### menu_categories

```sql
CREATE TABLE menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  blurb text,                                      -- "Masa madre, 24h de fermentación"
  display_order int NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX menu_categories_business_idx ON menu_categories (business_id, display_order);
```

### menu_items

```sql
CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_price decimal(10,2) NOT NULL,
  image_url text,
  image_hue int,                                   -- 0-360 para placeholder
  display_order int NOT NULL DEFAULT 0,
  is_available boolean DEFAULT true,
  is_compact boolean DEFAULT false,                -- "destacado" (nombre histórico): primero en su categoría + badge
  badges text[] DEFAULT ARRAY[]::text[],           -- ['más-pedido', 'nuevo', 'edición-perú']
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX menu_items_category_idx ON menu_items (category_id, display_order);
CREATE INDEX menu_items_business_available_idx ON menu_items (business_id, is_available);
```

### menu_modifier_groups

```sql
CREATE TABLE menu_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,                              -- "Tamaño", "Extras"
  selection_type text NOT NULL CHECK (selection_type IN ('single','multi')),
  is_required boolean DEFAULT false,
  min_selections int DEFAULT 0,
  max_selections int,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### menu_modifier_options

```sql
CREATE TABLE menu_modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES menu_modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  additional_price decimal(10,2) NOT NULL DEFAULT 0.00,
  display_order int NOT NULL DEFAULT 0,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX menu_modifier_options_group_idx ON menu_modifier_options (group_id, display_order);
```

### menu_item_modifier_groups (M:N)

```sql
CREATE TABLE menu_item_modifier_groups (
  item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id uuid REFERENCES menu_modifier_groups(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, group_id)
);
```

### customer_order_items

```sql
CREATE TABLE customer_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id),
  item_name_snapshot text NOT NULL,                -- preservado por si cambia el menú
  base_price_snapshot decimal(10,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price decimal(10,2) NOT NULL,
  line_total decimal(10,2) NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX coi_order_idx ON customer_order_items (order_id);
```

### customer_order_item_modifiers

```sql
CREATE TABLE customer_order_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES customer_order_items(id) ON DELETE CASCADE,
  group_name_snapshot text NOT NULL,
  option_name_snapshot text NOT NULL,
  additional_price_snapshot decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX coim_item_idx ON customer_order_item_modifiers (item_id);
```

---

## 6. Tablas de billing

### settlements (liquidaciones semanales)

Ver detalle en `12-billing-y-liquidaciones.md`. DDL:

```sql
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  order_count int NOT NULL DEFAULT 0,
  total_amount decimal(10,2) NOT NULL DEFAULT 0.00,
  status settlement_status NOT NULL DEFAULT 'pending',
  due_date date NOT NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES users(id),
  payment_method text,
  payment_note text,
  excluded_reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, period_start, period_end)
);
CREATE INDEX settlements_status_idx ON settlements (status);
CREATE INDEX settlements_business_idx ON settlements (business_id, period_end DESC);
```

### cash_settlements (liquidación diaria efectivo)

```sql
CREATE TABLE cash_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  settlement_date date NOT NULL,
  total_cash decimal(10,2) NOT NULL DEFAULT 0.00,
  order_count int NOT NULL DEFAULT 0,
  status cash_settlement_status NOT NULL DEFAULT 'pending',
  delivered_amount decimal(10,2),
  delivered_at_ts timestamptz,
  confirmed_amount decimal(10,2),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id),
  reported_amount decimal(10,2),
  dispute_note text,
  disputed_at timestamptz,
  resolved_amount decimal(10,2),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, driver_id, settlement_date)
);
CREATE INDEX cs_status_idx ON cash_settlements (status);
CREATE INDEX cs_date_idx ON cash_settlements (settlement_date DESC);
```

### restaurant_payments (pagos del negocio a Tindivo)

```sql
CREATE TABLE restaurant_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  settlement_id uuid REFERENCES settlements(id),
  amount decimal(10,2) NOT NULL,
  payment_method text NOT NULL,
  paid_at timestamptz NOT NULL,
  registered_by uuid REFERENCES users(id),
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX rp_business_idx ON restaurant_payments (business_id, paid_at DESC);
```

---

## 7. Tablas de notificaciones e infraestructura

### push_subscriptions

```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_successful_at timestamptz,
  last_failed_at timestamptz,
  failure_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
COMMENT ON TABLE push_subscriptions IS 'Suscripciones Web Push VAPID por usuario y dispositivo.';
CREATE INDEX ps_user_idx ON push_subscriptions (user_id);
```

### push_delivery_log

```sql
CREATE TABLE push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','error')),
  error_code int,
  error_message text,
  at timestamptz DEFAULT now()
);
COMMENT ON TABLE push_delivery_log IS 'Log de intentos de envío Web Push. Retención 30d.';
CREATE INDEX pdl_at_idx ON push_delivery_log (at DESC);
CREATE INDEX pdl_status_idx ON push_delivery_log (status, at DESC);
```

### domain_events (outbox)

```sql
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz DEFAULT now(),
  published_at timestamptz,
  retry_count int DEFAULT 0,
  last_error text
);
COMMENT ON TABLE domain_events IS 'Outbox de eventos de dominio. Trigger dispatch a Edge Function send-push e Inngest.';
CREATE INDEX de_aggregate_idx ON domain_events (aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX de_unpublished_idx ON domain_events (published_at) WHERE published_at IS NULL;
CREATE INDEX de_event_type_idx ON domain_events (event_type, occurred_at DESC);
```

### idempotency_keys

```sql
CREATE TABLE idempotency_keys (
  key uuid NOT NULL,
  scope text NOT NULL,
  user_id uuid NOT NULL,
  request_hash text NOT NULL,
  response_status int,
  response_body jsonb,
  status text DEFAULT 'reserved' CHECK (status IN ('reserved','completed')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  PRIMARY KEY (key, scope)
);
COMMENT ON TABLE idempotency_keys IS 'Cache de idempotencia tipo Stripe para POSTs de creación.';
CREATE INDEX ik_expires_idx ON idempotency_keys (expires_at);
```

### admin_alerts

```sql
CREATE TABLE admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,                              -- 'cash_dispute', 'driver_offline_with_orders', etc.
  payload jsonb NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX aa_unresolved_idx ON admin_alerts (created_at DESC) WHERE resolved_at IS NULL;
```

### app_settings

```sql
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
COMMENT ON TABLE app_settings IS 'Configuración global editable por admin (key-value).';
```

Filas iniciales:

```sql
INSERT INTO app_settings (key, value) VALUES
  ('platform_schedule', '{"days":["mon","tue","wed","thu","fri","sat","sun"],"startHHMM":"00:00","endHHMM":"23:59"}'),
  ('assignment_rules', '{"maxOrdersPerDriver":3,"maxRestaurantsPerDriver":2,"maxOccupancySlotsPerOrder":3,"groupingWindowMinutes":5}'),
  ('support_phone', '"+51987654321"'),
  ('commissions', '{"pickup":0.50,"near":3.00,"medium":3.25,"far":3.50}');
```

---

## 8. Helper functions

```sql
-- Rol primario del usuario actual
CREATE OR REPLACE FUNCTION current_user_role() RETURNS text AS $$
  SELECT primary_role::text FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ¿El usuario actual tiene este rol?
CREATE OR REPLACE FUNCTION current_user_has_role(p_role user_role) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = p_role
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Business ID del usuario actual
CREATE OR REPLACE FUNCTION current_business_id() RETURNS uuid AS $$
  SELECT id FROM public.businesses WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Driver ID del usuario actual
CREATE OR REPLACE FUNCTION current_driver_id() RETURNS uuid AS $$
  SELECT id FROM public.drivers WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Generar shortId único
CREATE OR REPLACE FUNCTION generate_short_id() RETURNS text AS $$
DECLARE
  v_short_id text;
  v_attempts int := 0;
BEGIN
  LOOP
    v_short_id := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE short_id = v_short_id);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'No se pudo generar shortId único tras 10 intentos';
    END IF;
  END LOOP;
  RETURN v_short_id;
END;
$$ LANGUAGE plpgsql;

-- Tracking público (SECURITY DEFINER, granted a anon)
CREATE OR REPLACE FUNCTION get_tracking(p_short_id text) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', short_id,
    'businessName', (SELECT name FROM businesses WHERE id = orders.business_id),
    'status', status,
    'estimatedReadyAt', estimated_ready_at,
    'deliveredAt', delivered_at,
    'driverName', (SELECT full_name FROM drivers WHERE id = orders.driver_id),
    'customerName', customer_name,
    'amount', order_amount,
    'deliveryFee', delivery_fee
  )
  INTO v_result
  FROM orders
  WHERE short_id = p_short_id
    AND (delivered_at IS NULL OR delivered_at > now() - interval '24 hours');

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION get_tracking(text) TO anon, authenticated;

-- Sync auth.users → public.users
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, primary_role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'primary_role')::user_role, 'customer'),
    true
  );
  -- Si tiene primary_role, también agregarlo a user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'primary_role')::user_role, 'customer'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 9. Triggers de dominio

### Mantener `updated_at`

```sql
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a cada tabla con updated_at
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at' AND table_schema = 'public'
  LOOP
    EXECUTE format('CREATE TRIGGER touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', r.table_name, r.table_name);
  END LOOP;
END $$;
```

### Mantener `assigned_at` en orders

```sql
CREATE OR REPLACE FUNCTION update_assigned_at() RETURNS trigger AS $$
BEGIN
  IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    NEW.assigned_at = now();
  ELSIF OLD.driver_id IS NOT NULL AND NEW.driver_id IS NULL THEN
    NEW.assigned_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_assigned_at
  BEFORE UPDATE OF driver_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_assigned_at();
```

### Actualizar `business.balance_due` en delivered y payment

```sql
CREATE OR REPLACE FUNCTION update_business_balance() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND OLD.status <> 'delivered' AND NEW.status = 'delivered' THEN
    UPDATE businesses
    SET balance_due = balance_due + COALESCE(NEW.tindivo_commission, 0)
    WHERE id = NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_balance_due
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_business_balance();

CREATE OR REPLACE FUNCTION decrement_balance_on_payment() RETURNS trigger AS $$
BEGIN
  UPDATE businesses
  SET balance_due = GREATEST(0, balance_due - NEW.amount),
      last_payment_at = NEW.paid_at
  WHERE id = NEW.business_id;

  -- Si quedó sin deuda y estaba bloqueado por mora, desbloquear
  UPDATE businesses
  SET is_blocked = false, block_reason = NULL
  WHERE id = NEW.business_id
    AND is_blocked = true
    AND balance_due = 0
    AND block_reason LIKE '%Deuda%';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurant_payments_decrement_balance
  AFTER INSERT ON restaurant_payments
  FOR EACH ROW
  EXECUTE FUNCTION decrement_balance_on_payment();
```

### Dispatch a Edge Function send-push y/o Inngest

```sql
CREATE OR REPLACE FUNCTION dispatch_event() RETURNS trigger AS $$
DECLARE
  v_url text;
  v_key text;
  v_inngest_url text;
  v_inngest_payload jsonb;
BEGIN
  -- Push notifications (subset de eventos)
  IF NEW.event_type IN (
    'OrderReadyForDrivers','OrderAssigned','OrderOverdue','OrderMarkedUrgent',
    'OrderTransferRequested','OrderTransferAccepted','OrderTransferRejected',
    'OrderTransferExpired','OrderTransferAutoAccepted','OrderAcceptedByRestaurant',
    'OrderAccepted','DriverArrived','OrderPickedUp','OrderDelivered','OrderCancelled',
    'OrderEdited','OrderReadyEarly','OrderExtended','PaymentMethodChanged',
    'CashSettlementRequested','CashSettlementConfirmed','CashSettlementDisputed',
    'CashSettlementResolved','SettlementMarkedPaid','BusinessBlocked','BusinessUnblocked'
  ) THEN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'send_push_url';
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
        body := jsonb_build_object(
          'event_id', NEW.id,
          'event_type', NEW.event_type,
          'aggregate_id', NEW.aggregate_id,
          'payload', NEW.payload,
          'metadata', NEW.metadata
        )
      );
    END IF;
  END IF;

  -- Inngest scheduling (subset de eventos que necesitan delay)
  IF NEW.event_type IN ('OrderCreated','OrderTransferRequested','OrderCreatedAsPendingAcceptance') THEN
    SELECT decrypted_secret INTO v_inngest_url FROM vault.decrypted_secrets WHERE name = 'inngest_webhook_url';
    IF v_inngest_url IS NOT NULL THEN
      v_inngest_payload := jsonb_build_object(
        'name', 'domain/' || lower(NEW.event_type),
        'data', NEW.payload
      );
      PERFORM net.http_post(
        url := v_inngest_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body := v_inngest_payload
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_domain_events_dispatch
  AFTER INSERT ON domain_events
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_event();
```

### Trigger reactivo de asignación (analog al v1)

Ver el v1 actual para detalle exhaustivo. Resumen:

```sql
-- Cuando un pedido entra a waiting_driver con appears_in_queue_at <= now()
-- llama al endpoint /internal/orders/assign-one
CREATE TRIGGER trg_orders_reactive_assign_aiu
  AFTER INSERT OR UPDATE OF status, appears_in_queue_at ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'waiting_driver' AND NEW.driver_id IS NULL AND NEW.appears_in_queue_at <= now())
  EXECUTE FUNCTION invoke_assign_one();

-- Cuando un driver rechaza, también dispara reasignación
CREATE TRIGGER trg_rejections_reactive_assign_ai
  AFTER INSERT ON order_assignment_rejections
  FOR EACH ROW
  EXECUTE FUNCTION invoke_assign_one_for_order();
```

Detalle de las funciones `invoke_assign_one` y `invoke_assign_one_for_order` en migración SQL.

---

## 10. RLS policies completas

```sql
-- Habilitar RLS en TODAS las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_assignment_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
```

### Policies por tabla (subset crítico)

#### `orders`

```sql
CREATE POLICY orders_admin_all ON orders FOR ALL
  USING (current_user_has_role('admin'));

CREATE POLICY orders_business_read ON orders FOR SELECT
  USING (current_user_has_role('business') AND business_id = current_business_id());

CREATE POLICY orders_business_update ON orders FOR UPDATE
  USING (current_user_has_role('business') AND business_id = current_business_id());

CREATE POLICY orders_driver_read ON orders FOR SELECT
  USING (
    current_user_has_role('driver') AND (
      driver_id = current_driver_id()
      OR (status = 'waiting_driver' AND appears_in_queue_at <= now())
    )
  );

CREATE POLICY orders_driver_update ON orders FOR UPDATE
  USING (current_user_has_role('driver') AND driver_id = current_driver_id());

CREATE POLICY orders_customer_read ON orders FOR SELECT
  USING (current_user_has_role('customer') AND customer_user_id = auth.uid());

CREATE POLICY orders_customer_insert ON orders FOR INSERT
  WITH CHECK (current_user_has_role('customer') AND customer_user_id = auth.uid());
```

#### `businesses`

```sql
CREATE POLICY businesses_admin_all ON businesses FOR ALL
  USING (current_user_has_role('admin'));

CREATE POLICY businesses_self_read ON businesses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY businesses_self_update ON businesses FOR UPDATE
  USING (user_id = auth.uid());

-- Drivers ven datos limitados de negocios de sus pedidos (vía endpoint, no SELECT directo desde browser)
CREATE POLICY businesses_driver_read ON businesses FOR SELECT
  USING (
    current_user_has_role('driver') AND id IN (
      SELECT business_id FROM orders WHERE driver_id = current_driver_id()
    )
  );

-- Lectura pública para marketplace (solo negocios con publishes_catalog=true)
CREATE POLICY businesses_public_read ON businesses FOR SELECT
  USING (publishes_catalog = true AND is_active = true AND is_blocked = false);
```

#### `push_subscriptions` y `push_delivery_log` (RLS activada — corrige bug v1)

```sql
CREATE POLICY ps_self ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY ps_admin_read ON push_subscriptions FOR SELECT
  USING (current_user_has_role('admin'));

CREATE POLICY pdl_admin_only ON push_delivery_log FOR SELECT
  USING (current_user_has_role('admin'));
-- INSERTs solo via service_role (Edge Function send-push)
```

#### `customer_profiles` y `customer_addresses`

```sql
CREATE POLICY cp_self ON customer_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY ca_self ON customer_addresses FOR ALL USING (user_id = auth.uid());
CREATE POLICY cp_admin_read ON customer_profiles FOR SELECT USING (current_user_has_role('admin'));
```

#### `domain_events` (solo admin lee, INSERTs por service_role)

```sql
CREATE POLICY de_admin_read ON domain_events FOR SELECT
  USING (current_user_has_role('admin'));
```

#### Menu (lectura pública para marketplace, escritura para owner)

```sql
CREATE POLICY mc_public_read ON menu_categories FOR SELECT
  USING (is_active = true AND business_id IN (
    SELECT id FROM businesses WHERE publishes_catalog = true AND is_active = true
  ));
CREATE POLICY mc_owner_all ON menu_categories FOR ALL
  USING (business_id = current_business_id());
CREATE POLICY mc_admin_all ON menu_categories FOR ALL
  USING (current_user_has_role('admin'));

-- Análogamente para menu_items, menu_modifier_groups, menu_modifier_options
```

---

## 11. Índices

Ver índices inline en cada CREATE TABLE arriba. Resumen de los críticos:

```sql
-- Hot paths
CREATE INDEX orders_business_status_idx ON orders (business_id, status);
CREATE INDEX orders_driver_status_idx ON orders (driver_id, status) WHERE driver_id IS NOT NULL;
CREATE INDEX orders_waiting_queue_idx ON orders (appears_in_queue_at)
  WHERE status = 'waiting_driver' AND driver_id IS NULL;

-- Búsquedas por shortId (tracking público)
CREATE INDEX orders_short_id_idx ON orders (short_id);

-- Métricas por fecha
CREATE INDEX orders_delivered_at_idx ON orders (delivered_at)
  WHERE status = 'delivered';

-- Asignación R1-R5 (rejection lookups)
CREATE INDEX oar_driver_active_idx ON order_assignment_rejections (driver_id, expires_at)
  WHERE expires_at > now();
```

Monitorear con `pg_stat_statements` cada 2 semanas y agregar índices según slow queries.

---

## 12. Publicación realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE 
  orders,
  cash_settlements,
  settlements,
  driver_availability,
  order_transfer_requests,
  admin_alerts;
```

NO se publican: `domain_events`, `push_subscriptions`, `push_delivery_log`, `order_status_history`, `idempotency_keys`, `app_settings`, `customer_addresses`. Las apps no necesitan suscribirse a ellas.

---

## 13. Storage buckets

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('business-logos', 'business-logos', true),
  ('business-qrs', 'business-qrs', true),
  ('menu-items', 'menu-items', true),
  ('payment-proofs', 'payment-proofs', false),
  ('receipts', 'receipts', false);

-- Policies de storage (ejemplo para business-logos)
CREATE POLICY "Public read business-logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'business-logos');

CREATE POLICY "Owner write business-logos" ON storage.objects
  FOR ALL USING (
    bucket_id = 'business-logos'
    AND (storage.foldername(name))[1] = current_business_id()::text
  );

CREATE POLICY "Admin all storage" ON storage.objects
  FOR ALL USING (current_user_has_role('admin'));
```

---

## 14. pg_cron schedule

```sql
SELECT cron.schedule('auto-cancel-pending-acceptance', '* * * * *', $$
  UPDATE orders
  SET status = 'cancelled', cancelled_at = now(),
      cancel_reason = 'Auto-cancelado: el restaurante no aceptó en 5 minutos'
  WHERE status = 'pending_acceptance'
    AND pending_acceptance_at < now() - interval '5 minutes';
$$);

SELECT cron.schedule('auto-close-drivers', '* * * * *', $$
  UPDATE driver_availability
  SET is_available = false
  WHERE is_available = true
    AND NOT can_be_available(driver_id, now());   -- función helper que verifica platform_schedule + shift
$$);

SELECT cron.schedule('prune-stale-push-subscriptions', '0 4 * * *', $$
  DELETE FROM push_subscriptions
  WHERE last_failed_at IS NOT NULL
    AND last_failed_at < now() - interval '14 days'
    AND (last_successful_at IS NULL OR last_successful_at < now() - interval '14 days');
$$);

SELECT cron.schedule('prune-idempotency-keys', '0 5 * * *', $$
  DELETE FROM idempotency_keys WHERE expires_at < now();
$$);

SELECT cron.schedule('prune-expired-rejections', '0 5 * * *', $$
  DELETE FROM order_assignment_rejections WHERE expires_at < now();
$$);

SELECT cron.schedule('prune-domain-events', '0 6 * * *', $$
  DELETE FROM domain_events WHERE occurred_at < now() - interval '90 days';
$$);

SELECT cron.schedule('prune-push-delivery-log', '0 6 * * *', $$
  DELETE FROM push_delivery_log WHERE at < now() - interval '30 days';
$$);

-- Failsafe crons (cada 5 min) ver §11-notificaciones-push.md
```

---

## 15. Retención de datos

| Tabla | Retención | Limpieza |
|---|---|---|
| `orders` | indefinida (5 años por contabilidad) | manual / archive |
| `order_status_history` | indefinida (mismo) | manual / archive |
| `domain_events` | 90 días | cron diario |
| `push_delivery_log` | 30 días | cron diario |
| `push_subscriptions` (inactivas) | 14 días | cron diario |
| `idempotency_keys` | 24 horas | cron diario |
| `order_assignment_rejections` | 6 horas | cron diario |
| `order_transfer_requests` | indefinida | no se limpia (low volume) |
| `customer_profiles` y `customer_addresses` | indefinida | manual al eliminar cuenta |

---

## 16. Seed inicial

```sql
-- 1. Crear admin via Supabase Auth API (TypeScript en seed.ts)
-- 2. Crear app_settings
INSERT INTO app_settings (key, value) VALUES
  ('platform_schedule', '{"days":["tue","wed","thu","fri","sat"],"startHHMM":"18:00","endHHMM":"23:00"}'),
  ('assignment_rules', '{"maxOrdersPerDriver":3,"maxRestaurantsPerDriver":2,"maxOccupancySlotsPerOrder":3,"groupingWindowMinutes":5}'),
  ('support_phone', '"+51987654321"'),
  ('commissions', '{"pickup":0.50,"near":3.00,"medium":3.25,"far":3.50}');

-- 3. Secrets en Vault (manual via dashboard)
-- service_role_key, app_internal_api_url, send_push_url, inngest_webhook_url
```

Script `prisma/seed.ts` equivalent crea admin + 1 business (Priamo) + 1 driver de prueba + algunos menu items para empezar a operar.

---

**Próximo doc**: `05-api-rest.md` — todos los endpoints con contratos Zod.
