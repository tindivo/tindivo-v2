# Auditoría: Módulo de deuda/liquidación restaurante ↔ Tindivo

> ## ⚠️ RE-MEDIDO EL 2026-09-02 — la sección 2 estaba entera equivocada
>
> Este documento describe la ruta del dinero y se lee como autoridad, así que
> vale la pena decir qué se comprobó y qué no. La sección **«2 · Cálculo de
> comisiones y acumulación»** tenía sus TRES afirmaciones desactualizadas: los
> importes de comisión, la función que acumula la deuda —que ya no existe— y el
> proceso de liquidación —que ya no existe—. Están corregidas abajo, con el
> texto viejo tachado para que se vea qué cambió y por qué.
>
> **El resto del documento NO se ha re-medido.** Si vas a decidir algo con él,
> comprueba antes contra la base viva: `supabase migration list`,
> `pg_get_functiondef` y `app_settings`. Un documento de dinero que no se
> re-mide envejece hacia el lado peligroso — es lo mismo que le pasó a
> `Docs/RIESGOS-LEDGER.md` y a `Docs/spec/PENDIENTES.md`.

Este documento contiene un análisis exhaustivo y fundamentado sobre cómo opera el flujo financiero de deudas, comisiones, adelantos y liquidaciones entre los restaurantes asociados y la plataforma Tindivo 2.0.

---

## 1. El apartado donde el restaurante "sube deuda"

* **Ruta del componente**: [apps/negocios/app/deuda/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/deuda/page.tsx)
* **Funcionalidad exacta**:
  El restaurante **no tiene un panel para registrar ni subir deudas por sí mismo**. El flujo contable y de adeudos es controlado por la administración o calculado de forma automatizada por la base de datos.
  En la pantalla `/deuda`, el restaurante puede:
  1. Visualizar su saldo consolidado pendiente (`balance_due`) y un indicador de progreso hacia el límite de suspensión automática fijado en **S/300** (`BLOCK_THRESHOLD = 300`, L280).
  2. Consultar sus liquidaciones semanales y el historial de adelantos de contingencia aplicados a su local.
  3. **Disputar cargos**: Si un adelanto de contingencia activo está cargado a su local (`actor_charged = 'restaurante'`), el restaurante tiene una ventana de **48 horas** (`DISPUTE_WINDOW_MS = 48 * 3600 * 1000`, L10) para presionar el botón "Disputar" (L155), ingresar una nota explicativa (mínimo 5 caracteres) y enviarla.
* **Endpoints consumidos**:
  * `POST /business/contingency/${id}/dispute` (L330): Llama a la función Postgres `dispute_contingency_advance`. Al ejecutarse, resta el monto disputado de `balance_due` para congelar temporalmente la deuda y genera una incidencia en la bandeja de reportes del admin (`reports` con tipo `'advance_dispute'`) para su validación manual.

---

## 2. Tablas involucradas

El backend de Tindivo gestiona las finanzas mediante cuatro tablas principales y un campo consolidado:

### A. Tabla `public.settlements`
* **Definición**: [0002_tables.sql:L455-L477](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L455-L477)
* **Propósito**: Almacena las facturaciones semanales de comisiones agrupadas por negocio. Generadas manualmente por la administración.
* **Schema**:
  ```sql
  create table if not exists public.settlements (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id),
    period_start date not null,
    period_end date not null,
    order_count int not null default 0,
    total_amount decimal(10,2) not null default 0.00,
    status public.settlement_status not null default 'pending', -- ('pending', 'paid', 'overdue', 'cancelled')
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
  ```

### B. Tabla `public.contingency_advances`
* **Definición**: [0002_tables.sql:L521-L542](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L521-L542)
* **Propósito**: Registro contable individualizado de devoluciones inmediatas y coberturas de fraude asociadas a pedidos que afectaron el fondo común.
* **Schema**:
  ```sql
  create table if not exists public.contingency_advances (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    customer_user_id uuid references public.users(id),
    customer_phone text,
    amount decimal(10,2) not null,
    reason text not null,
    proof_url text,
    actor_charged public.contingency_actor_charged not null, -- ('cliente', 'restaurante', 'motorizado', 'tindivo')
    status public.contingency_advance_status not null default 'activo', -- ('activo', 'disputado', 'cancelado')
    disputed_at timestamptz,
    dispute_note text,
    resolved_at timestamptz,
    resolved_by uuid references public.users(id),
    operator uuid references public.users(id),
    replenished_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  ```

### C. Tabla `public.restaurant_payments`
* **Definición**: [0002_tables.sql:L506-L519](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L506-L519)
* **Propósito**: Almacena el histórico de abonos/pagos reales de los restaurantes recibidos y liquidados por la administración.
* **Schema**:
  ```sql
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
  ```

### D. Tabla `public.businesses` (Campos financieros)
* **Definición**: [0002_tables.sql:L48-L82](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L48-L82)
* **Campos clave**:
  * `balance_due decimal(10,2)`: Monto consolidado pendiente de pago que el negocio adeuda a la plataforma (suma comisiones + adelantos del fondo no pagados).
  * `is_blocked boolean` y `blocked_for_debt boolean`: Controlan la suspensión automática de operaciones si la deuda excede el tope de la plataforma.

### Relación con `orders`
* `contingency_advances` posee una relación de clave foránea directa `order_id references orders(id)`.
* `settlements` no tiene una clave foránea directa, sino que agrupa comisiones filtrando los pedidos en base al identificador `orders.business_id` y su fecha de entrega convertida a la hora local `(orders.delivered_at at time zone 'America/Lima')::date` (L32).
* `restaurant_payments` se asocia indirectamente a través del `settlement_id`.

---

## 3. Cálculo de comisiones y liquidación

* **Momento de cálculo**:
  La comisión de Tindivo se determina y se guarda como una captura estática en la columna `tindivo_commission` de la tabla `orders` cuando el motorizado **recoge el pedido** (evento `pickup` del RPC `advance_order`).

  > ✅ **Corregido el 2026-09-02.** Aquí decía: *«recojo local S/0.50; delivery
  > por banda — Cerca S/3.00, Lejos S/3.50»*. Las tres cifras y el criterio
  > cambiaron. **La `0125` sacó la banda del cálculo de la comisión**: ya no hay
  > `near`/`far`, solo `pickup`/`delivery`, y el envío se suma aparte en vez de
  > restarse. Valor vivo medido en `app_settings.commissions`:
  >
  > ```json
  > {"pickup": 1.00, "delivery": 1.50}
  > ```
  >
  > Los `commission_override_pickup` / `commission_override_delivery` del
  > negocio siguen mandando sobre estos, como antes.

* **Acumulación de deuda**:
  Cuando el pedido pasa a `'delivered'`, el trigger `trg_orders_balance_due` sobre `orders` ejecuta **`generate_delivery_charges()`**, que INSERTA las líneas correspondientes en el ledger `business_charges`. Ese insert dispara a su vez `trg_business_charges_recalc_balance`, que **recalcula** `businesses.balance_due` entero desde el ledger.

  > ✅ **Corregido el 2026-09-02.** Aquí decía que el trigger ejecuta
  > `update_business_balance()` «incrementando de forma inmediata el campo
  > `businesses.balance_due` por pedido». Las dos mitades son falsas hoy:
  >
  > · **`update_business_balance()` NO EXISTE** — la borró la `0123` por
  >   huérfana (era el menor M-1 de `RIESGOS-LEDGER.md`).
  > · **`balance_due` ya no se incrementa a mano.** Desde la `0124` es un
  >   **cache derivado**: `SUM(business_charges WHERE status = 'pending')`,
  >   recalculado entero por su trigger. La fuente de verdad es el ledger, como
  >   manda `AGENTS.md §2.2`; la columna es solo su reflejo.
  >
  > El nombre del trigger es historia y no describe lo que hace — lleva un
  > `COMMENT` que lo avisa desde la `0205`.

* **Proceso de liquidación periódica**:
  **No existe.** No hay pantalla, ni RPC, ni tabla.

  > ✅ **Corregido el 2026-09-02.** Aquí decía que la administración invoca
  > manualmente el RPC `generate_settlements` desde la App Admin. Nada de eso
  > sigue en pie:
  >
  > · La **`0124`** borró `pay_settlement`, `generate_settlements` y la tabla
  >   `settlements` entera, además de las columnas `settlement_id`. Se fueron
  >   porque `generate_settlements` sumaba `orders.tindivo_commission` — una
  >   TERCERA base de cálculo, distinta del ledger y de `balance_due`.
  > · `generate_settlements` reapareció por accidente —la `0176` la recreó con
  >   un `create or replace` en un barrido— y quedó **rota**, insertando en una
  >   tabla inexistente. La **`0200`** la volvió a borrar.
  > · Nunca hubo pantalla en `apps/admin` que la llamara.
  >
  > Lo que sí existe hoy para cobrar es `settle_business_charges`, que trabaja
  > sobre el ledger. Si algún día hace falta facturar por período, se diseña de
  > cero contra `business_charges`.

---

## 4. Vista de admin

* **Pantallas de control**:
  1. **Cobros semanales**: [apps/admin/app/cobros/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/app/cobros/page.tsx).
     * *Qué muestra*: Lista las liquidaciones generadas, indicando negocio, rango de fechas, cantidad de pedidos agrupados, monto acumulado de comisiones, estado de pago (`pending`, `paid`, `overdue`), y el botón para registrar abonos.
     * *Endpoints*:
       * `GET /admin/settlements`: Lista las liquidaciones activas.
       * `POST /admin/settlements`: Envía los parámetros para el cálculo y generación de la liquidación semanal del período.
       * `POST /admin/settlements/${id}/pay`: Marca la liquidación semanal seleccionada como pagada.
  2. **Contingencia y Pérdidas**: [apps/admin/app/contingencia/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/app/contingencia/page.tsx).
     * *Qué muestra*: El balance disponible del fondo de contingencia, un formulario para registrar pérdidas extraordinarias asignando su coste (cargado al restaurante o absorbido por Tindivo), y el listado de adelantos con capacidad para resolver disputas activas.
     * *Endpoints*:
       * `GET /admin/contingency` y `POST /admin/contingency` (para registrar pérdidas).
       * `POST /admin/contingency/${id}/resolve` (para fallar a favor o en contra de disputas de restaurante).

---

## 5. Flujo de cobro

* **Cómo se registra que Tindivo cobró**:
  1. El administrador marca una liquidación semanal como cobrada desde el botón "Marcar pagado" (L195) de la app Admin.
  2. Esto ejecuta el RPC de base de datos `pay_settlement` [[0026_contingency_fund_key_fix.sql:L62-L114](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0026_contingency_fund_key_fix.sql#L62-L114)]:
     * Inserta un registro en `restaurant_payments` con el total amortizado.
     * El trigger `trg_restaurant_payments_decrement_balance` decrementa el `balance_due` del negocio. Si la cuenta estaba bloqueada por deuda mora y el saldo actual de balance_due llega a `0`, **se desbloquea al negocio en tiempo real**.
     * **Reposición del fondo**: Recupera todos los adelantos de contingencia cobrados al restaurante que no hubieran sido repuestos (`status = 'activo'` y `replenished_at is null`), marca `replenished_at = now()` y suma este reembolso al saldo disponible de contingencia (`contingency_fund.balance` en `app_settings`), limpiando la deuda.
* **Historial de cobros**:
  Los abonos históricos se registran físicamente en la tabla `restaurant_payments`. Actualmente, la app Admin **no** expone visualmente un listado de pagos históricos de abonos recibidos; únicamente el estatus de las liquidaciones de comisión semanal generadas (`paid`).

---

## 6. Dependencias

Si se eliminase o modificase el apartado de deudas de la app Negocios (`deuda/page.tsx`):
* **Componentes rotos**:
  * El enlace de navegación lateral de la aplicación Negocios (`chrome.tsx` L48, L56 y L72).
  * El banner persistente de advertencia por cuenta suspendida (`chrome.tsx` L787, `page.tsx` L135 y L562).
* **Endpoints / Queries inutilizados**:
  * La consulta `load` que lee de `contingency_advances`, `settlements` y `support_whatsapp` en `deuda/page.tsx`.
  * El endpoint `POST /business/contingency/${id}/dispute` de la API.
  * La función RPC de base de datos `dispute_contingency_advance`.
* *Impacto operativo*: El restaurante perdería el canal e interfaz de auto-servicio para reclamar y disputar cargos por reembolsos de fraude/contingencia aplicados a su cuenta, requiriendo conciliación enteramente manual por soporte.

---

## 7. Fondo de contingencia / cobertura de fraude

* **Relación contable**:
  * La tabla `fraud_coverage_claims` guarda solicitudes de cobertura por incidentes de fraude o fallos en pedidos.
  * Al aprobarse un reclamo de cobertura mediante el RPC `resolve_fraud_claim` [[0039_fix_resolve_fraud_claim_enum_cast.sql:L21-L27](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0039_fix_resolve_fraud_claim_enum_cast.sql#L21-L27)], se inserta de forma automática un adelanto en `contingency_advances`.
  * Dado que se trata de un reclamo de fraude aprobado y asumido por Tindivo, se registra con **`actor_charged = 'tindivo'`**.
  * Al crearse, la función RPC `create_contingency_advance` descuenta el importe del saldo del fondo de contingencia (`contingency_fund.balance`), pero **no genera deuda alguna al restaurante** (evita sumar el monto a su `balance_due`). El local recibe el dinero y Tindivo absorbe la pérdida contra el fondo.
