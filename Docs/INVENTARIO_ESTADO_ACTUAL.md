# Inventario del Estado ACTUAL del Repo B2C Nuevo (`tindivo-v2`)
**Módulos:** Motorizados y Pedidos Manuales de Negocio  
**Fecha de Auditoría:** 23 de Julio, 2026  
**Repositorio Auditado:** `d:\Tinkuy Creativo\Proyectos\Tindivo\Code\tindivo-v2`  

> **Nota Metodológica:** Este documento reporta **única y exclusivamente** el código y esquema de base de datos verificado empíricamente en el repositorio actual.

---

## PARTE A — MÓDULO MOTORIZADO (app `motorizados`)

### A1. Existencia y Alcance

* **Ruta exacta en el monorepo:** `apps/motorizados`
* **Árbol de archivos que existen hoy en el módulo:**
  ```text
  apps/motorizados/
  ├── .env.local
  ├── next.config.ts
  ├── postcss.config.mjs
  ├── package.json
  ├── tsconfig.json
  ├── public/
  │   ├── icon.svg
  │   └── sw.js
  ├── app/
  │   ├── globals.css
  │   ├── layout.tsx
  │   ├── manifest.ts
  │   ├── page.tsx
  │   ├── efectivo/
  │   │   └── page.tsx
  │   └── pedido/
  │       └── [id]/
  │           └── page.tsx
  ├── components/
  │   ├── login.tsx
  │   ├── offline-banner.tsx
  │   ├── push-manager.tsx
  │   ├── source-chip.tsx
  │   ├── home/
  │   │   ├── availability-card.tsx
  │   │   ├── available-tab.tsx
  │   │   ├── home.tsx
  │   │   ├── mine-tab.tsx
  │   │   ├── order-card.tsx
  │   │   └── team-tab.tsx
  │   ├── order/
  │   │   ├── business-card.tsx
  │   │   ├── collect-card.tsx
  │   │   ├── customer-card.tsx
  │   │   ├── deliver-sheet.tsx
  │   │   ├── delivered-screen.tsx
  │   │   ├── incident-sheet.tsx
  │   │   ├── map-readonly-inner.tsx
  │   │   ├── map-readonly.tsx
  │   │   ├── moment-picked-up.tsx
  │   │   ├── order-detail.tsx
  │   │   ├── pickup-sheet.tsx
  │   │   ├── preview-section.tsx
  │   │   ├── ready-prompt-sheet.tsx
  │   │   ├── status-hero.tsx
  │   │   └── wait-timer.tsx
  │   └── transfers/
  │       ├── request-transfer-sheet.tsx
  │       └── transfer-watcher.tsx
  ├── hooks/
  │   ├── use-driver-orders.ts
  │   ├── use-now.ts
  │   └── use-online.ts
  └── lib/
      ├── api.ts
      ├── deeplinks.ts
      ├── format.ts
      ├── offline-queue.ts
      ├── transitions.ts
      ├── types.ts
      ├── urgency.ts
      └── supabase/
          └── client.ts
  ```
* **¿Compila? ¿Se puede navegar? ¿Ejecutado contra datos reales?:**  
  **Sí, compila y se puede navegar.** La aplicación es un Next.js App Router configurado en el puerto 3004. Consume endpoints `/api/v1/driver/*` mediante `@tindivo/api-client` y consultas directas con el SDK `@supabase/supabase-js`. Cuenta con guardas de autenticación en [apps/motorizados/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/app/page.tsx).

---

### A2. Capacidades por Estado

| Capacidad | Estado | Archivo Referenciado | Observaciones / Cobertura |
| :--- | :--- | :--- | :--- |
| **Autenticación y sesión** | **EXISTE** | [apps/motorizados/components/login.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/login.tsx) | Supabase Auth `signInWithPassword` y `getSession()`. |
| **Lista de pedidos disponibles** | **EXISTE** | [apps/motorizados/components/home/available-tab.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/home/available-tab.tsx) | Filtra `status = 'waiting_driver'`, `driver_id IS NULL` y `appears_in_queue_at <= now()`. |
| **Lista de pedidos activos propios** | **EXISTE** | [apps/motorizados/components/home/mine-tab.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/home/mine-tab.tsx) | Muestra pedidos en `heading_to_restaurant`, `waiting_at_restaurant`, `picked_up` asignados al driver. |
| **Detalle de pedido** | **EXISTE** | [apps/motorizados/app/pedido/[id]/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/app/pedido/[id]/page.tsx) | Componente [order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/order/order-detail.tsx) completo. |
| **Aceptar pedido** | **EXISTE** | [apps/motorizados/components/home/order-card.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/home/order-card.tsx) | Envía `action: 'take'` hacia `/driver/orders/:id/transition` (transición a `heading_to_restaurant`). |
| **Marcar llegada al restaurante** | **EXISTE** | [apps/motorizados/components/order/status-hero.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/order/status-hero.tsx) | Action `arrived` (pasa a `waiting_at_restaurant`). |
| **Marcar recogido (pickup)** | **EXISTE** | [apps/motorizados/components/order/pickup-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/order/pickup-sheet.tsx) | Action `pickup` (pasa a `picked_up`, permite especificar `occupancy_slots` 1-3). |
| **Marcar entregado** | **EXISTE** | [apps/motorizados/components/order/deliver-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/order/deliver-sheet.tsx) | Action `deliver` (pasa a `delivered`, confirma método de pago `paid_cash` o `paid_yape`). |
| **Captura de dirección/GPS en entrega** | **NO EXISTE** | — | No hay captura de coordenadas `navigator.geolocation` ni envío de GPS en la entrega o en la ruta. |
| **Navegación GPS** | **PARCIAL** | [apps/motorizados/lib/deeplinks.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/deeplinks.ts) | Genera deeplink a Google Maps (`mapsDirToCoords`). Waze NO EXISTE. |
| **Contacto WhatsApp al cliente** | **EXISTE** | [apps/motorizados/lib/deeplinks.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/deeplinks.ts) | Funciones `waLink` y `telLink` integradas en [customer-card.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/order/customer-card.tsx). |
| **Registro/rendición de efectivo** | **EXISTE** | [apps/motorizados/app/efectivo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/app/efectivo/page.tsx) | Consume `/driver/cash-settlements` para consultar y registrar entregas de efectivo por negocio. |
| **Historial de entregas** | **PARCIAL** | [apps/motorizados/hooks/use-driver-orders.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/hooks/use-driver-orders.ts) | Muestra los pedidos entregados **hoy** (`deliveredToday`). No hay tab con historial de días anteriores. |
| **Perfil y switch de disponibilidad** | **PARCIAL** | [apps/motorizados/components/home/availability-card.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/home/availability-card.tsx) | Card para alternar disponibilidad `/driver/availability` con control de horario. Pantalla de perfil dedicada NO EXISTE. |

---

### A3. Sincronización de Datos

* **Mecanismo:** **Realtime + Re-fetch reactivo por visibilidad.**
* **Canal Realtime:**
  * **Nombre de canal:** `drv-orders`
  * **Tabla suscrita:** `public.orders`
  * **Filtro exacto:** `event: '*', schema: 'public', table: 'orders'` (sin filtro de nivel de fila en la suscripción JS; la seguridad la aplica RLS en Supabase).
* **Polling:** **NO EXISTE polling por temporizador** (`setInterval` no utilizado). Se re-ejecuta `refetch()` en los eventos `postgres_changes` y cuando la pestaña vuelve a ser visible (`visibilitychange`).
* **Lógica de salud y fallback offline:**
  * Implementada en [apps/motorizados/lib/offline-queue.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/offline-queue.ts) y [transitions.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/transitions.ts).
  * Si la red falla durante una transición, se guarda la mutación en localStorage con un `Idempotency-Key` (UUID) y se actualiza el estado optimista local.
  * Al reconectar (evento `online`), `flushQueue()` procesa la cola FIFO.
  * Muestra banner visual de estado offline vía [offline-banner.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/offline-banner.tsx).

---

### A4. Notificaciones

* **Web Push:** **EXISTE.**
  * VAPID configurado mediante `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en [push-manager.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/push-manager.tsx).
  * Service Worker registrado en [apps/motorizados/public/sw.js](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/public/sw.js).
  * Registra la suscripción en el backend vía `/push/subscribe`.
* **Vibración y Alerta Sonora:**
  * Vibración: **PARCIAL.** Configurada en `sw.js` (si la payload push incluye `vibrate`) y en [transfer-watcher.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/components/transfers/transfer-watcher.tsx) con `navigator.vibrate([200, 100, 200])`.
  * Sonido (audio): **NO EXISTE** en el app de motorizados (la alerta sonora `use-audio-alert.ts` existe únicamente en el app `negocios`).
* **Estado Real:** **Andamiaje funcional y conectado al backend.** Requiere llaves VAPID configuradas en entorno para emisión en vivo.

---

## PARTE B — MÓDULO PEDIDO MANUAL (app `negocios`)

### B1. Formulario de Creación Manual

* **Ruta y Componente:** [apps/negocios/app/nuevo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/nuevo/page.tsx) (`NuevoPedidoPage`).
* **Lista de TODOS los campos presentes hoy en el formulario:**
  1. `prep`: Tiempo de preparación (Selector de botones: 10, 15, 20, 25, 30, 35, 40, 45, 50 min).
  2. `name`: Nombre del cliente (input de texto opcional).
  3. `phone`: Teléfono del cliente (input numérico opcional).
  4. `reference`: Dirección o referencia (textarea máx 500 caracteres).
  5. `payment`: Método de pago (selector de 4 tarjetas: `pending_cash`, `pending_wallet`, `prepaid`, `pending_mixed`).
  6. `amount`: Monto total del pedido (input decimal).
  7. `walletPart`: Monto asignado a billetera digital (visible solo si `payment === 'pending_mixed'`).
  8. `cashPart`: Monto asignado a efectivo (visible solo si `payment === 'pending_mixed'`).
  9. `paysWith`: Cliente paga con (input decimal para efectivo / mixto).

* **Comparativa con el Sistema Viejo:**

| Campo / Función | Estado en Tindivo v2 | Detalle de Implementación |
| :--- | :--- | :--- |
| **Teléfono** | **EXISTE** | Opcional, validado con Regex `/^9\d{8}$/`. |
| **Nombre cliente** | **EXISTE** | Opcional, hasta 120 caracteres. |
| **Dirección / Referencia** | **EXISTE** | Campo único `deliveryReference` (máx 500 caracteres). |
| **Tiempo de preparación** | **EXISTE** | Botones predefinidos de 10 a 50 min (default 20 min). |
| **Toggle "Listo ahora"** | **NO EXISTE** | No existe opción instantánea de 0 min; mínimo selector es 10 min. |
| **Método de pago (4 opciones)** | **EXISTE** | `pending_cash` (Efectivo), `pending_wallet` (Billetera digital), `prepaid` (Ya pagó), `pending_mixed` (Mixto). |
| **Monto del pedido** | **EXISTE** | Campo `orderAmount`. No requiere desglose de platos del catálogo. |
| **"Paga con" + cálculo de vuelto** | **EXISTE** | Campo `clientPaysWith`, calcula automáticamente `change = paysWith - cashTarget` y lo destaca en pantalla. |
| **Desglose de pago mixto (Yape + Efectivo)** | **EXISTE** | Campos `walletPart` y `cashPart`, exige que la suma sea exactamente igual al total. |

---

### B2. Autocompletado por Teléfono

* **¿Existe búsqueda de cliente por teléfono?:** **NO EXISTE.** El formulario actual es plano y no realiza peticiones al escribir el número.
* **¿Existe tabla de direcciones históricas?:** **PARCIAL / SOLO B2C REGISTRADO.**  
  Existe la tabla `public.customer_addresses` (asociada a `user_id uuid`), pero **NO existe ninguna tabla de historial de direcciones por número telefónico suelto**.
* **¿Existe el endpoint de búsqueda de direcciones por teléfono?:** **NO EXISTE.**
* **¿Existe el popup/selector de direcciones múltiples?:** **NO EXISTE.**
* **Comportamiento actual al ingresar un teléfono conocido:** Ninguno. La cajera debe escribir la dirección y nombre manualmente cada vez.

---

### B3. Validaciones Actuales

* **Regex de teléfono en uso:** `/^9\d{8}$/` (validado en frontend [apps/negocios/app/nuevo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/nuevo/page.tsx) y en backend Zod).
* **Blacklist de números de prueba:** **NO EXISTE** (no hay arreglo ni tabla de números bloqueados para pruebas).
* **Validaciones de monto y pago:**
  * `orderAmount > 0`.
  * Si es pago mixto (`pending_mixed`), se exige `Math.abs(walletPart + cashPart - orderAmount) < 0.005`.
  * Si el cliente paga en efectivo/mixto con `clientPaysWith`, este debe ser `>= cashTarget`.
* **Horario de plataforma y bloqueo por mora:**
  * En la API REST `/api/v1/business/orders`, la RPC PostgreSQL `create_business_manual_order` verifica si el negocio está en estado `is_blocked` (retorna error `P0001` - Tu cuenta está suspendida) o `is_active = false`.
  * Ejecuta guardas antifraude en BD: `customer_is_blocked` y `customer_requires_prepayment`.

---

## PARTE C — MODELO DE DATOS ACTUAL (crítico)

### C1. DDL Completo y Real de la Tabla `orders`

Definición completa consolidada desde las migraciones `0002_tables.sql`, `0031_business_dashboard_fields.sql`, `0059_prepaid_awaiting_payment_flow.sql`, `0067_appeal_resolution_flow.sql` y `0074_separate_commission_and_delivery_fee.sql`:

```sql
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint NOT NULL DEFAULT nextval('public.order_number_seq'),
  short_id text UNIQUE NOT NULL,

  business_id uuid NOT NULL REFERENCES public.businesses(id),
  driver_id uuid REFERENCES public.drivers(id),
  customer_user_id uuid REFERENCES public.users(id),
  source public.order_source NOT NULL DEFAULT 'business_manual',
  is_manual boolean GENERATED ALWAYS AS (source = 'business_manual') STORED,

  -- Datos del cliente
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_reference text,
  delivery_coordinates_lat decimal(10,7),
  delivery_coordinates_lng decimal(10,7),
  delivery_maps_url text,
  delivery_method public.delivery_method NOT NULL DEFAULT 'delivery',
  delivery_distance_band public.distance_band,

  -- Pago y montos
  order_amount decimal(10,2) NOT NULL,
  delivery_fee decimal(10,2) NOT NULL,
  payment_intent public.payment_intent NOT NULL,
  payment_real public.payment_real,
  yape_amount decimal(10,2),
  cash_amount decimal(10,2),
  client_pays_with decimal(10,2),
  change_to_give decimal(10,2),
  yape_confirmed boolean NOT NULL DEFAULT false,
  cash_owed_at_delivery decimal(10,2),
  tindivo_commission decimal(10,2),
  comprobante_prepago_url text,
  commission_amount numeric,
  delivery_fee_charged numeric,

  -- Verificación de prepago y rechazos
  payment_verified_at timestamptz,
  payment_verified_by uuid REFERENCES public.users(id),
  payment_proof_status text CONSTRAINT orders_payment_proof_status_chk CHECK (
    payment_proof_status IS NULL OR payment_proof_status IN ('pending', 'verified', 'rejected')
  ),
  proof_attempt smallint NOT NULL DEFAULT 0,
  rejection_reason_code text CONSTRAINT orders_rejection_reason_code_chk CHECK (
    rejection_reason_code IS NULL OR rejection_reason_code IN (
      'out_of_stock', 'closed', 'out_of_zone', 'invalid_proof', 'no_answer', 'other'
    )
  ),
  rejection_reason_text text,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.users(id),

  -- Tiempos y cola
  prep_time_minutes int,
  estimated_ready_at timestamptz,
  appears_in_queue_at timestamptz,
  prep_extended_at timestamptz,
  prep_extension_count int NOT NULL DEFAULT 0 CHECK (prep_extension_count BETWEEN 0 AND 2),
  ready_early_used boolean NOT NULL DEFAULT false,

  -- Capacidad mochila
  occupancy_slots int NOT NULL DEFAULT 1 CHECK (occupancy_slots BETWEEN 1 AND 3),

  -- Estado y urgencia
  status public.order_status NOT NULL DEFAULT 'pending_acceptance',
  urgent_since timestamptz,
  assigned_at timestamptz,

  -- Timestamps de transición
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
  cancelled_by uuid REFERENCES public.users(id),
  cancel_reason public.cancel_reason,
  cancel_note text,

  -- Tracking y Apelaciones / Reembolsos
  tracking_link_sent_at timestamptz,
  tracking_link_sent_by uuid REFERENCES public.users(id),
  appeal_status text,
  refund_status text,
  refund_proof_path text,
  refund_amount numeric(10,2),
  refund_completed_at timestamptz,
  appeal_deadline timestamptz,

  -- Notas
  customer_notes text,
  business_notes text,
  driver_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_short_id_format CHECK (short_id ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$')
);
```

---

### C2. Enum Completo y Real de `order_status`

Definido en `0001_extensions_and_enums.sql` y ampliado en `0058_awaiting_payment_state.sql`:

```sql
CREATE TYPE public.order_status AS ENUM (
  'validando',
  'awaiting_payment',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
  'delivered',
  'cancelled'
);
```

---

### C3. Auditoría Específica de Columnas en `orders`

| Nombre Consultado | Estado en `orders` | Nombre / Tipo Real en la BD |
| :--- | :--- | :--- |
| `source` | **EXISTE** | `public.order_source` (default `'business_manual'`) |
| `client_phone` | **NO EXISTE** | Se llama `customer_phone text` |
| `client_name` | **NO EXISTE** | Se llama `customer_name text` |
| `delivery_reference` | **EXISTE** | `text` |
| `delivery_lat` | **NO EXISTE** | Se llama `delivery_coordinates_lat decimal(10,7)` |
| `delivery_lng` | **NO EXISTE** | Se llama `delivery_coordinates_lng decimal(10,7)` |
| `customer_address_id` | **NO EXISTE** | No existe FK a `customer_addresses` en `orders` |
| `prep_time_option` | **NO EXISTE** | Se llama `prep_time_minutes int` |
| `prep_minutes` | **NO EXISTE** | Se llama `prep_time_minutes int` |
| `estimated_ready_at` | **EXISTE** | `timestamptz` |
| `appears_in_queue_at` | **EXISTE** | `timestamptz` |
| `base_commission` | **NO EXISTE** | Se llama `tindivo_commission decimal(10,2)` y `commission_amount numeric` |
| `far_surcharge_amount` | **NO EXISTE** | La tarifa total está en `delivery_fee` y `delivery_fee_charged` |
| `occupancy_slots` | **EXISTE** | `int` (default 1, check between 1 and 3) |
| `delivery_distance_band` | **EXISTE** | `public.distance_band` (`'near'`, `'far'`) |
| `cash_owed_at_delivery` | **EXISTE** | `decimal(10,2)` |
| `urgent_since` | **EXISTE** | `timestamptz` |
| `driver_id` | **EXISTE** | `uuid REFERENCES public.drivers(id)` |
| `accepted_at` | **NO EXISTE** | Se registra en `assigned_at` / `heading_at` (driver) y `confirmed_at` (negocio) |
| `waiting_at` | **NO EXISTE** | Se llama `waiting_at_restaurant_at timestamptz` |
| `received_at` | **NO EXISTE** | No existe esa columna |
| `picked_up_at` | **EXISTE** | `timestamptz` |
| `delivered_at` | **EXISTE** | `timestamptz` |
| `client_pays_with` | **EXISTE** | `decimal(10,2)` |
| `change_to_give` | **EXISTE** | `decimal(10,2)` |
| `yape_amount` | **EXISTE** | `decimal(10,2)` |
| `cash_amount` | **EXISTE** | `decimal(10,2)` |

---

### C4. DDL de Tablas Relacionadas

#### 1. `drivers` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L94-L110)
```sql
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  vehicle_type public.vehicle_type NOT NULL DEFAULT 'moto',
  license_plate text,
  operating_days text[] NOT NULL DEFAULT ARRAY['tue','wed','thu','fri','sat']::text[],
  shift_start text NOT NULL DEFAULT '18:00',
  shift_end text NOT NULL DEFAULT '23:00',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 2. `driver_availability` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L112-L119)
```sql
CREATE TABLE IF NOT EXISTS public.driver_availability (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT false,
  shift_started_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3. `driver_restaurants` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L121-L129)
```sql
CREATE TABLE IF NOT EXISTS public.driver_restaurants (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.users(id),
  PRIMARY KEY (driver_id, business_id)
);
```

#### 4. `customer_addresses` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L148-L162)
```sql
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Casa',
  line text,
  reference text NOT NULL,
  coordinates_lat decimal(10,7),
  coordinates_lng decimal(10,7),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 5. `address_capture_events` (**NO EXISTE**)

#### 6. `customer_profiles` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L131-L146)
```sql
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  default_address text,
  default_reference text,
  default_coordinates_lat decimal(10,7),
  default_coordinates_lng decimal(10,7),
  default_location_accuracy_m int,
  phone_verified_at timestamptz,
  strikes int NOT NULL DEFAULT 0,
  contraentrega_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 7. `order_status_history` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L310-L319)
```sql
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  changed_by uuid REFERENCES public.users(id),
  notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

#### 8. `order_transfer_requests` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L346-L359) + [0043_driver_transfers_and_slots.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0043_driver_transfers_and_slots.sql#L19-L20)
```sql
CREATE TABLE IF NOT EXISTS public.order_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_driver_id uuid NOT NULL REFERENCES public.drivers(id),
  to_driver_id uuid NOT NULL REFERENCES public.drivers(id),
  status public.transfer_request_status NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  expires_at timestamptz
);
```

#### 9. `domain_events` (**EXISTE**) — [0002_tables.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L600-L615)
```sql
CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retry_count int NOT NULL DEFAULT 0,
  last_error text
);
```

---

### C5. Identidad del Cliente

* **DDL de `users`:**
  ```sql
  CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY, -- auth.users.id
    email text UNIQUE NOT NULL,
    full_name text,
    primary_role public.user_role NOT NULL DEFAULT 'customer',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ```
* **¿Dónde viven las direcciones de un usuario B2C registrado?:** En `public.customer_addresses` (`user_id uuid REFERENCES public.users(id)`).
* **Relación entre direcciones B2C y un teléfono suelto:** **NO EXISTE RELACIÓN DIRECTA.**  
  Las direcciones en `customer_addresses` pertenecen a un `user_id`. Cuando se crea un pedido manual por teléfono suelto, la información se almacena de forma desnormalizada directamente en las columnas `customer_phone` y `delivery_reference` de la tabla `orders`. La única asociación por teléfono se realiza en la tabla anti-fraude `customer_strikes`.

---

### C6. Migraciones

* **Número total de migraciones en `supabase/migrations`:** **78 migraciones** (`0001_extensions_and_enums.sql` a `0078_fix_prepaid_accept_flow.sql`).
* **Últimas 10 migraciones:**
  1. `0069_enrich_order_event_log_data.sql`
  2. `0070_tracking_appeal_fields.sql`
  3. `0071_appeal_strike_on_dismiss.sql`
  4. `0072_fix_strike_report_trigger.sql`
  5. `0073_business_charges_table_and_triggers.sql`
  6. `0074_separate_commission_and_delivery_fee.sql`
  7. `0075_charges_settlement_support.sql`
  8. `0076_fix_double_balance_decrement.sql`
  9. `0077_decouple_contingency_advances.sql`
  10. `0078_fix_prepaid_accept_flow.sql`
* **¿Migraciones que modifican driver o pedido manual?:** **Sí.**
  * Driver: `0014`, `0018`, `0029`, `0043`, `0074`, `0078`.
  * Pedido manual: `0019`, `0031`, `0032`, `0033`, `0042`, `0044`.

---

## PARTE D — ARQUITECTURA Y CONVENCIONES

* **`packages/core` vs Endpoint logic:**
  * `packages/core` contiene reglas puras de dominio en TypeScript (máquina de estados, comisiones, generador de short_id, utilidades de dinero).
  * **La lógica de negocio/persistencia vive centralizada en funciones RPC de PostgreSQL en Supabase** (ej. `create_business_manual_order`, `advance_order`, `validate_order`). La API REST en Next.js actúan como controlador que autentica y llama a la RPC.
* **`@tindivo/contracts`:**
  * **EXISTE.** Contiene esquemas de validación Zod.
  * **Convención de nombres:** PascalCase con sufijo `Schema` (ej. `DeliveryMethodSchema`, `PaymentIntentSchema`, `OrderStatusSchema`).
* **Librería de estado utilizada:**
  * **NINGUNA (ni Zustand ni TanStack Query).** Se utilizan hooks nativos de React (`useState`, `useEffect`, `useCallback`, `useMemo`) combinados con `@tindivo/api-client` y el SDK de Supabase.
* **Patrón de rutas API y Auth por Rol:**
  * Next.js App Router estructurado por rol: `apps/api/app/api/v1/[driver|business|customer|admin]`.
  * La autenticación por rol se ejecuta mediante el helper `requireRole(req, 'business')` en [apps/api/lib/http/auth.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/http/auth.ts), el cual valida el Bearer token de Supabase Auth y consulta la tabla `user_roles`.
* **Manejo de errores estandarizado:**
  * Implementa **RFC 9457 / RFC 7807 (Problem Details)** mediante [apps/api/lib/http/problem.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/http/problem.ts) y `@tindivo/api-client`.
  * Devuelve objetos de error estructurados con `type`, `title`, `status`, `detail`, `code` y `requestId`.
* **Cliente Admin de Supabase (`service_role`):**
  * **Sí se utiliza.** `createServiceClient()` en [apps/api/lib/supabase/service.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/supabase/service.ts) usa `SUPABASE_SERVICE_ROLE_KEY` para ejecutar RPCs con `SECURITY DEFINER` e ignorar RLS en mutaciones del servidor.
* **Idempotencia:**
  * Implementada mediante la tabla `public.idempotency_keys` (TTL 24h).
  * El cliente envía el header `Idempotency-Key` (UUID) en los POSTs de mutación. El app de motorizados genera UUIDs optimistas en [transitions.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/transitions.ts).
* **Convención de nomenclatura BD vs Frontend:**
  * Base de Datos & SQL: `snake_case` (ej. `order_amount`, `prep_time_minutes`).
  * API / Zod / Frontend: `camelCase` (ej. `orderAmount`, `prepTimeMinutes`).
  * Las rutas API transforman `camelCase` a parámetros RPC `p_snake_case`.

---

## PARTE E — REALTIME Y SUPABASE

* **Tablas en la publicación `supabase_realtime`:**
  1. `public.orders`
  2. `public.businesses`
  3. `public.cash_settlements`
  4. `public.settlements`
  5. `public.driver_availability`
  6. `public.order_transfer_requests`
  7. `public.admin_alerts`
  8. `public.reports`
* **Tablas con `REPLICA IDENTITY FULL`:**
  * `public.orders`
  * `public.businesses`
* **Buckets de Storage y Políticas RLS:**
  1. `business-logos` (Público) — Lectura anon/auth; Escritura solo por el negocio dueño.
  2. `business-qrs` (Público) — Lectura anon/auth; Escritura solo por el negocio dueño.
  3. `menu-items` (Público) — Lectura anon/auth; Escritura solo por el negocio dueño.
  4. `payment-proofs` (Privado) — Subida y lectura aislada por carpeta `auth.uid()`.
  5. `receipts` (Privado) — Subida y lectura aislada por carpeta `auth.uid()`.
* **Estado de RLS:**
  * **Habilitado en TODAS las tablas de dominio** (`orders`, `businesses`, `drivers`, `driver_availability`, `driver_restaurants`, `customer_profiles`, `customer_addresses`, etc.) en `0004_rls.sql`.
  * La lectura de `orders` para motorizados (`ord_driver_read`) condiciona ver pedidos en `waiting_driver` a que el motorizado esté vinculado al negocio en `driver_restaurants` y que `appears_in_queue_at <= now()`.

---

## PARTE F — RESPUESTAS DIRECTAS

1. **Si hoy se crea un pedido manual, ¿aparece en algún lado para un motorizado?**  
   **Sí.** Nace en estado `preparing` con `appears_in_queue_at = now() + (prep_minutes - 10)`. Al vencer el tiempo o cambiar a `waiting_driver` (sin driver asignado), la RLS `ord_driver_read` y el hook `useDriverOrders` lo muestran en la pestaña "Disponibles" del app `motorizados` para los drivers vinculados a ese negocio en `driver_restaurants`.

2. **Si hoy se crea un pedido B2C online y el cliente paga, ¿qué pasa después? ¿Termina en `waiting_driver`?**  
   **Sí.** Inicia en `pending_acceptance` (o `validando`). Cuando el negocio lo acepta, pasa a `preparing` con su tiempo de preparación. Al finalizar la preparación (o presionar "Listo antes de tiempo"), la RPC `advance_order` cambia el estado a `waiting_driver`, quedando visible para ser tomado por un motorizado.

3. **¿Quién o qué setea `appears_in_queue_at` hoy, si existe?**  
   **PostgreSQL (en las RPCs `create_business_manual_order`, `create_customer_order` y `advance_order`).** Se calcula en SQL como `now() + make_interval(mins => greatest(0, prep_minutes - 10))`.

4. **¿Existe alguna lógica de asignación de pedido a driver? ¿Automática o manual?**  
   **Manual ("claim" por el driver).** No hay asignación automática centralizada activa en Fase 1. El pedido queda en la cola `waiting_driver` y el primer motorizado que presiona "Tomar pedido" se asigna el pedido (`driver_id`) y pasa el estado a `heading_to_restaurant`.

5. **¿Un driver puede hoy ver pedidos solo de ciertos restaurantes, o de todos?**  
   **Solo de los restaurantes vinculados a su cuenta en `driver_restaurants`.** La política RLS `ord_driver_read` restringe los pedidos en `waiting_driver` a aquellos cuyos `business_id` estén otorgados al driver en dicha tabla.

6. **¿Qué porcentaje aproximado del módulo motorizado dirías que está construido? Justifica.**  
   **80% – 85%.**  
   *Justificación:* La arquitectura base (PWA, Next.js), las pantallas principales (Disponibles, Pedidos Propios, Rendición de Efectivo, Detalle), la máquina de estados en base de datos (`take`, `arrived`, `pickup`, `deliver`, `no_show`), la cola offline con idempotencia, Web Push y el control de disponibilidad están construidos y funcionales.  
   *Lo que falta para el 100%:* Falta el tracking GPS en background / transmisión continua de ubicación en ruta, la integración a Waze (solo hay Google Maps), alertas sonoras de audio al ingresar pedidos y una pantalla de perfil de usuario dedicada.
