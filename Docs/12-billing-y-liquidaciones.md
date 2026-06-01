# 12 · Billing y liquidaciones

> Cómo Tindivo cobra a los negocios y cómo se mueve el dinero del efectivo recolectado por motorizados. Reglas, fórmulas, fechas, flujos, casos de excepción.

---

## Tabla de contenidos

- [1. Resumen del modelo financiero](#1-resumen-del-modelo-financiero)
- [2. Comisión por pedido entregado](#2-comisión-por-pedido-entregado)
- [3. Cálculo de la comisión en delivery](#3-cálculo-de-la-comisión-en-delivery)
- [4. Cálculo de la comisión en pickup](#4-cálculo-de-la-comisión-en-pickup)
- [5. Liquidación semanal de comisiones](#5-liquidación-semanal-de-comisiones)
- [6. Liquidación diaria de efectivo](#6-liquidación-diaria-de-efectivo)
- [7. Disputas de efectivo](#7-disputas-de-efectivo)
- [8. Bloqueo por mora](#8-bloqueo-por-mora)
- [9. Modelos de datos](#9-modelos-de-datos)
- [10. Auditoría y reportes](#10-auditoría-y-reportes)

---

## 1. Resumen del modelo financiero

```
┌──────────────────────────────────────────────────────────────┐
│ DINERO EN MOVIMIENTO POR PEDIDO ENTREGADO                    │
└──────────────────────────────────────────────────────────────┘

  Cliente paga (Yape / efectivo / mixto / prepago)
       │
       ├─► Yape o prepago → directo al negocio
       │
       └─► Efectivo → motorizado retiene durante turno
              │
              └─► Fin de turno → motorizado entrega al negocio
                                   │
                                   └─► Negocio confirma o disputa

  Negocio acumula DEUDA con Tindivo por cada pedido entregado
       │
       └─► Lunes 10am: admin genera liquidación de la semana
              │
              └─► Negocio paga (Yape, transferencia, efectivo)
                     │
                     └─► Admin marca como pagado
                            │
                            └─► Si estaba bloqueado por mora → desbloquea
```

### Tres flujos de dinero

1. **Cliente ↔ Negocio**: pago del pedido. NO pasa por Tindivo en MVP.
2. **Driver ↔ Negocio**: entrega de efectivo recolectado al final del turno.
3. **Negocio → Tindivo**: comisión por pedido entregado, liquidada semanalmente.

---

## 2. Comisión por pedido entregado

### Reglas centrales

1. **Solo se cobra por pedido entregado** (`status = 'delivered'`). Cancelados NO suman deuda.
2. **La comisión es fija por banda de distancia** declarada por el motorizado al recoger. NO se calcula por coordenadas (es subjetiva del driver basada en su conocimiento del pueblo).
3. **Comisión registrada al momento de la entrega**, no antes. Si el pedido se cancela en `picked_up` por admin, no se cobra (excepción documentada — caso extremadamente raro).
4. **No hay membresía**, no hay setup fee, no hay descuentos por volumen en MVP.

### Tabla de comisiones

| Tipo de pedido | Banda distancia | Comisión |
|---|---|---|
| Pickup (cliente recoge en local) | N/A | **S/ 0.50** |
| Delivery con motorizado Tindivo | Cerca (< ~5 cuadras) | **S/ 3.00** |
| Delivery con motorizado Tindivo | Media (5-15 cuadras) | **S/ 3.25** |
| Delivery con motorizado Tindivo | Lejos (> 15 cuadras) | **S/ 3.50** |

Los montos son configurables vía `app_settings` por si en el futuro se ajustan, pero NO son configurables por negocio (regla del MVP: misma tabla para todos).

---

## 3. Cálculo de la comisión en delivery

### Cuándo se aplica

El pedido tiene `delivery_method = 'delivery'` AND `business.uses_tindivo_drivers = true`.

### Cómo se determina la banda

El motorizado declara la banda al marcar el pedido como `picked_up`:

```ts
// Comando del use case MarkPickedUp
type MarkPickedUpCommand = {
  orderId: OrderId
  occupancySlots: 1 | 2 | 3
  deliveryDistanceBand: 'near' | 'medium' | 'far'   // ← declarativo
}
```

### Cálculo

En `MarkDeliveredUseCase`:

```ts
async execute(cmd: MarkDeliveredCommand) {
  const order = await this.orders.findById(cmd.orderId)
  // ...

  // Calcular comisión basada en banda
  const commissionMap = {
    near: Money.pen(3.00),
    medium: Money.pen(3.25),
    far: Money.pen(3.50),
  }
  const commission = commissionMap[order.deliveryDistanceBand]

  order.markDelivered(commission, this.clock.now())
  // Order persiste tindivo_commission = commission
  // Trigger en BD: UPDATE businesses SET balance_due = balance_due + commission

  await this.orders.save(order)
}
```

### Auditoría

La fila `orders` guarda `tindivo_commission` (decimal) para que el cálculo sea inmutable. Si en el futuro cambia la tabla de comisiones (e.g., S/3.50 → S/4.00), los pedidos antiguos mantienen su valor original.

---

## 4. Cálculo de la comisión en pickup

### Cuándo se aplica

El pedido tiene `delivery_method = 'pickup'`. El cliente recoge en el local.

### Comisión fija

S/ 0.50 sin depender de distancia (no hay distancia).

### Cuándo se carga

En `MarkDeliveredUseCase` (sí, en pedidos pickup también — "delivered" significa "el cliente lo recogió y se lo llevó"). Lo confirma el negocio en la app: tocan "Marcar como entregado al cliente" cuando el cliente sale del local.

### Cero comisión

Si un negocio en MVP necesita "prueba gratuita" inicial, el admin puede setear `business.commission_override = 0` por un período (configurable en negocio). Es excepción, no regla.

---

## 5. Liquidación semanal de comisiones

### Cuándo

Cada **lunes a las 10:00 (zona horaria Lima)**, el admin abre `admin.tindivo.com/cobros` y toca **"Generar liquidaciones de la semana"**.

### Período cubierto

La semana anterior: **lunes 00:00 → domingo 23:59:59** (Lima time).

### Flujo

1. Admin toca el botón.
2. Sistema calcula por negocio:
   ```sql
   SELECT business_id,
          COUNT(*) AS order_count,
          SUM(tindivo_commission) AS total_amount
   FROM orders
   WHERE status = 'delivered'
     AND delivered_at >= '<periodStart>'
     AND delivered_at <= '<periodEnd>'
   GROUP BY business_id;
   ```
3. Sistema muestra preview por negocio:
   - Pedidos entregados.
   - Monto a cobrar.
   - Fecha de vencimiento sugerida (default: viernes de esa semana).
4. Admin puede ajustar antes de confirmar:
   - **Excluir negocios** (e.g., con pocos pedidos, mejor esperar a la próxima semana).
   - **Editar fecha de vencimiento individual**.
   - **Agregar nota** ("primera liquidación, plazo extendido").
5. Admin confirma → se crean filas en `settlements` con `status = 'pending'`.
6. Admin envía los cobros por WhatsApp (manual, fuera del sistema).
7. Cuando el negocio paga (Yape, transferencia, efectivo), admin toca **"Marcar como pagado"**.
8. Sistema:
   - Setea `status = 'paid'`, `paid_at = now()`, `paid_by = admin_id`.
   - Trigger BD descuenta del `business.balance_due`.
   - Si el negocio estaba bloqueado por esta deuda, **desbloquea automáticamente**.
   - Push al negocio: *"Tu pago fue registrado. Gracias."*

### ¿Por qué manual y no automático?

- El admin debe revisar antes de cobrar: detectar anomalías, negocios con pocos pedidos que conviene esperar, problemas con el cálculo.
- Cobrar es un acto de relación (especialmente en pueblos). Tindivo no quiere automatizar la fricción.
- En post-MVP se puede automatizar con setting "Auto-generate settlement every Monday at 10am". Hoy no.

### Casos especiales

- **Negocio con S/ 0 en la semana**: no se genera liquidación (no tiene sentido cobrar S/ 0).
- **Negocio bloqueado a mitad de semana**: pedidos previos al bloqueo entran en la liquidación. Pedidos post-bloqueo no existen (estaba bloqueado).
- **Multi-liquidación**: si pasa un mes sin generar (por error), el admin puede generar liquidaciones de semanas anteriores especificando `periodStart` y `periodEnd` manualmente.

### Visualización para el negocio

En `negocios.tindivo.com/deuda` el negocio ve:
- **Deuda actual** (suma de liquidaciones pending + comisión acumulada de la semana en curso, no liquidada todavía).
- **Historial de liquidaciones**: período, monto, estado (pending / paid / overdue), fecha de vencimiento, fecha de pago si aplica.
- **Cómo pagar**: información del Yape de Tindivo + cuenta bancaria.

---

## 6. Liquidación diaria de efectivo

### Contexto

Cuando el cliente paga con efectivo (o mixto Yape+Efectivo), el motorizado retiene el dinero durante su turno. Al final del turno, lo entrega al negocio que vendió esos pedidos.

### Patrón "uno a uno"

Si el driver hizo entregas a 3 negocios distintos, hay 3 entregas de efectivo separadas (no un pool común). Cada negocio confirma su monto independientemente.

### Flujo

1. **Driver toca "Entregar efectivo"** en su app, eligiendo el negocio destino.
2. App muestra **monto pre-calculado** (suma de `client_pays_with - change_to_give` de pedidos cash de ese día/negocio).
3. Driver puede ajustar el monto (si retuvo o entregó algo distinto al esperado por humanidad — e.g., descuento de propina implícito).
4. Driver confirma → se crea `cash_settlement` con `status = 'pending_confirmation'`, `delivered_amount = X`.
5. **Negocio recibe push**: *"Efectivo por confirmar — {driver_name}: S/ {amount}"*.
6. Negocio ve la solicitud en `negocios.tindivo.com/efectivo`.
7. Cajero **cuenta el dinero físicamente** y elige:
   - **Confirmar** → ingresa `received_amount`. Si coincide con `delivered_amount`, `status = 'confirmed'`. Caso cerrado.
   - **Reportar diferencia** → ingresa `reported_amount` + nota. `status = 'disputed'`. Va a admin.

### Cuánto debería ser

```ts
const expectedAmount = orders
  .filter(o => o.payment_status_real === 'pending_cash' || o.payment_status_real === 'pending_mixed')
  .filter(o => o.business_id === businessId)
  .filter(o => o.delivered_at >= startOfDay)
  .reduce((sum, o) => sum + (o.client_pays_with - o.change_to_give), 0)
```

Lo retiene el driver. Al final del turno entrega ese monto.

### Casos especiales

- **Driver olvidó marcar entrega**: al día siguiente puede crear la cash_settlement con fecha de ayer (campo `settlement_date` editable).
- **Negocio no confirma en 24h**: pasa a estado `auto_assumed_confirmed` (con flag para auditoría). Esto evita que el driver quede en limbo.
- **Driver con pedidos para múltiples negocios**: una `cash_settlement` por negocio. Drivers hacen N entregas físicas.

---

## 7. Disputas de efectivo

### Cuándo ocurre

El cajero del negocio dice "este motorizado me trajo S/ 80, no S/ 87 como dice la app". Reporta diferencia.

### Flujo

1. Cajero toca **"Reportar diferencia"**, ingresa `reported_amount` + nota obligatoria.
2. `cash_settlement.status = 'disputed'`.
3. **Push al driver**: *"Disputa de efectivo — {business_name}: dice {reported_amount}"*.
4. **Push al admin**: *"Disputa de efectivo · {business_name} vs {driver_name}"*.
5. La disputa aparece en `admin.tindivo.com/disputas` con:
   - Datos del settlement.
   - Pedidos asociados (lista de orders entregados ese día con sus pagos).
   - Snapshot de lo que dijo el driver (`delivered_amount`).
   - Snapshot de lo que dijo el negocio (`reported_amount` + nota).
6. Admin investiga (puede llamar a ambas partes) y elige:
   - **Aceptar monto del driver**: `resolved_amount = delivered_amount`.
   - **Aceptar monto del negocio**: `resolved_amount = reported_amount`.
   - **Establecer monto custom**: `resolved_amount = X`.
   En cualquier caso, nota obligatoria.
7. `status = 'resolved'`. Push a ambas partes con resolución.

### Regla cultural

> **El driver NO discute en el local con el cajero.** Si hay diferencia, el cajero reporta en la app, el admin resuelve. Esto se le dice explícitamente al driver en su onboarding.

Razón: evitar conflictos personales en el local que dañen la relación operativa.

### Auditoría

Cada disputa queda registrada en `cash_settlements` con todos los campos:
- `delivered_amount`, `delivered_at_ts`, `delivered_by` (driver).
- `reported_amount`, `dispute_note`, `disputed_at`.
- `resolved_amount`, `resolved_at`, `resolved_by` (admin), `resolution_note`.

Inmutable post-resolución. No se puede editar después.

---

## 8. Bloqueo por mora

### Cuándo se bloquea un negocio

- Liquidación con `status = 'overdue'` (pasado `due_date` sin pago) Y deuda total > S/ 50.
- Admin puede bloquear manualmente en cualquier momento con motivo.

### Cómo se bloquea

```sql
UPDATE businesses
SET is_blocked = true,
    block_reason = 'Deuda vencida S/ X.XX'
WHERE id = '<id>';
```

### Efecto

- El negocio no puede crear pedidos manuales (`POST /business/orders` retorna 403).
- El negocio no puede recibir pedidos web (si `accepts_web_pickup` o `accepts_web_delivery` están activos, su listing se oculta del marketplace público temporalmente).
- El negocio SÍ puede ver su historial y deuda — los datos NO se ocultan.
- En login, se le muestra un banner con teléfono de soporte para regularizar.

### Cómo se desbloquea

**Automático**: cuando todas las liquidaciones overdue se marquen `paid`, el trigger BD setea `is_blocked = false`.

**Manual**: admin puede desbloquear con motivo (e.g., "acuerdo verbal, paga el viernes").

### Auditoría

Tabla `admin_actions_log` (post-MVP) registra cada bloqueo/desbloqueo con timestamp + motivo + actor.

---

## 9. Modelos de datos

### Tabla `settlements`

```sql
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  order_count int NOT NULL DEFAULT 0,
  total_amount decimal(10,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  due_date date NOT NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES users(id),
  payment_method text,                         -- 'yape' | 'transfer' | 'cash'
  payment_note text,
  excluded_reason text,                        -- si admin excluye antes de confirmar
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),        -- admin que generó
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, period_start, period_end)
);
```

### Tabla `cash_settlements`

```sql
CREATE TABLE cash_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  settlement_date date NOT NULL,
  total_cash decimal(10,2) NOT NULL DEFAULT 0.00,    -- pre-calculado
  order_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'pending_confirmation', 'confirmed', 'disputed', 'resolved', 'auto_assumed_confirmed'
  )),
  -- Driver declara
  delivered_amount decimal(10,2),
  delivered_at_ts timestamptz,
  -- Negocio confirma
  confirmed_amount decimal(10,2),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id),
  -- Si hay disputa
  reported_amount decimal(10,2),
  dispute_note text,
  disputed_at timestamptz,
  -- Admin resuelve
  resolved_amount decimal(10,2),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, driver_id, settlement_date)
);
```

### Tabla `restaurant_payments` (pagos manuales del negocio a Tindivo)

```sql
CREATE TABLE restaurant_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  settlement_id uuid REFERENCES settlements(id), -- opcional, link a settlement específica
  amount decimal(10,2) NOT NULL,
  payment_method text NOT NULL,                  -- 'yape' | 'transfer' | 'cash'
  paid_at timestamptz NOT NULL,
  registered_by uuid REFERENCES users(id),       -- admin
  note text,
  created_at timestamptz DEFAULT now()
);
-- Trigger BD: tras INSERT, UPDATE businesses SET balance_due = balance_due - amount
```

### Campos en `orders` relacionados a billing

```sql
-- En orders:
tindivo_commission decimal(10,2),               -- snapshot al delivered_at
delivery_distance_band text,                    -- 'near' | 'medium' | 'far' (declarativo, set en picked_up)
delivery_method text,                           -- 'delivery' | 'pickup'
payment_status text,                            -- intent al crear
payment_status_real text,                       -- real al entregar
yape_amount decimal(10,2),                      -- si mixed
cash_amount decimal(10,2),                      -- si mixed o cash
client_pays_with decimal(10,2),                 -- cuánto dio el cliente
change_to_give decimal(10,2),                   -- vuelto a devolver
cash_owed_at_delivery decimal(10,2),            -- pre-calculado para el cash_settlement
```

### Campos en `businesses` relacionados a billing

```sql
balance_due decimal(10,2) DEFAULT 0.00,         -- deuda acumulada con Tindivo
last_settlement_at timestamptz,                 -- última liquidación generada
last_payment_at timestamptz,                    -- último pago registrado
is_blocked boolean DEFAULT false,
block_reason text,
commission_override_pickup decimal(10,2),       -- null = usa default S/0.50
commission_override_near decimal(10,2),         -- null = usa default S/3.00
commission_override_medium decimal(10,2),       -- null = usa default S/3.25
commission_override_far decimal(10,2),          -- null = usa default S/3.50
```

Los overrides están por si en MVP el admin negocia un descuento con un negocio (ej. restaurante nuevo en prueba 1 mes con S/0).

---

## 10. Auditoría y reportes

### Reportes disponibles para el admin

En `admin.tindivo.com/cobros`:

- **Tabla principal**: negocio · deuda actual · próximo vencimiento · pedidos en la semana en curso.
- **Filtros**: con deuda / vencidos / pagados / todos.
- **Detalle por negocio**: historial de liquidaciones, pagos registrados, deuda en el tiempo (sparkline).

En `admin.tindivo.com/metricas`:

- **Ventas (timeseries)**: GMV (suma de orders.order_amount) por día/semana/mes.
- **Comisión Tindivo (timeseries)**: suma de tindivo_commission por día/semana/mes.
- **Top 10 negocios por GMV**.
- **Top 10 drivers por entregas**.

### Reportes para el negocio

En `negocios.tindivo.com/deuda`:

- Deuda actual + breakdown.
- Historial de liquidaciones (CSV exportable post-MVP).
- Historial de pagos hechos a Tindivo.

### Reportes para el driver

En `motorizados.tindivo.com/efectivo`:

- Resumen del día: pedidos cash entregados, total a entregar a cada negocio.
- Historial de settlements por día.

### Inmutabilidad

- `settlements` nunca se borran. Si una se generó por error, se marca `status = 'cancelled'` con `excluded_reason`.
- `cash_settlements` post-resolución no se editan.
- `restaurant_payments` nunca se borran. Si fue error, se crea un payment negativo compensatorio con nota.

---

**Próximo doc**: `08-flujo-admin.md` — el panel de control del admin en detalle.
