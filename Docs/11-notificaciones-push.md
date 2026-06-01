# 11 · Notificaciones push

> Pipeline completo de Web Push. Cómo se programa, se dispara, se entrega. Cómo se resuelve el bug de latencia v1 que motivó esta reescritura. Mapa exhaustivo de cada evento del dominio → su notificación correspondiente.

---

## Tabla de contenidos

- [1. Problema que resolvemos](#1-problema-que-resolvemos)
- [2. Arquitectura del pipeline](#2-arquitectura-del-pipeline)
- [3. Suscripción del cliente](#3-suscripción-del-cliente)
- [4. Outbox + Edge Function send-push](#4-outbox--edge-function-send-push)
- [5. Inngest para scheduling](#5-inngest-para-scheduling)
- [6. Failsafe crons](#6-failsafe-crons)
- [7. Mapa de eventos → notificaciones](#7-mapa-de-eventos--notificaciones)
- [8. Reglas de UX para notificaciones](#8-reglas-de-ux-para-notificaciones)
- [9. Limitaciones del SO verificadas](#9-limitaciones-del-so-verificadas)
- [10. Observabilidad](#10-observabilidad)
- [11. Configuración VAPID](#11-configuración-vapid)
- [12. Recomendaciones para el usuario final](#12-recomendaciones-para-el-usuario-final)

---

## 1. Problema que resolvemos

### El bug de latencia en v1

En el sistema actual, cuando un pedido entra en demora (`estimated_ready_at < now() - 5min` sin asignación), el cron `enqueue-overdue-orders-failsafe` corre cada 1 min y emite el evento `OrderOverdue`. Por consecuencia:

- Latencia P50: ~30s (si entras en el minuto correcto).
- Latencia P99: **hasta 60s** (si entras justo después de un tick).

**Para un negocio donde cada segundo cuenta y los motorizados son 1-2 personas, 60s es inaceptable**.

### La causa raíz no era "el cron es lento"

El cron de 1 min es razonable para chequeos generales. El error fue **usar polling para detectar deadlines individuales**. Cada pedido tiene su propio `estimated_ready_at`. La pregunta correcta no es "qué pedidos están demorados ahora", sino "este pedido específico, ¿sigue sin asignación 5 min después de su tiempo estimado?".

### La solución

**Scheduling event-driven con Inngest**: cuando se crea el pedido, se programa un único disparo a `estimated_ready_at + 5min`. Inngest despierta con precisión ~2-5s y verifica el estado. **Latencia P99 objetivo: < 5 segundos**.

Esto se aplica también a otros deadlines individuales (transferencias 30s, pending acceptance 5min).

---

## 2. Arquitectura del pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│                         FLUJO DE PUSH                            │
└──────────────────────────────────────────────────────────────────┘

  Use Case (modules/orders/...)
       │ order.raise(new OrderCreated(...))
       ▼
  EventPublisher.publishAll(events)
       │ INSERT INTO domain_events (...)
       │ (misma transacción que UPDATE orders)
       ▼
  ┌──────────────────────────────────────────────────┐
  │  PostgreSQL: trigger trg_domain_events_dispatch  │
  └─────┬──────────────────────────────┬─────────────┘
        │                              │
        │ pg_net.http_post             │ pg_net.http_post
        ▼                              ▼
  Edge Function                  Inngest webhook
  send-push                      (events que requieren scheduling)
        │                              │
        │ Web Push VAPID                │ step.sleepUntil(scheduledFor)
        ▼                              │
  Push service                          │ ...después...
  (FCM / APNs)                          ▼
        │                       Verificar estado actual
        ▼                              │
  Device / SW                          ▼
  showNotification                Emit evento OrderOverdue
                                       │
                                       └──► (vuelve al top con nuevo evento)
```

### Componentes

1. **Outbox `domain_events`**: tabla Postgres donde se persisten todos los eventos del dominio en la misma transacción que el cambio de estado.
2. **Edge Function `send-push`**: recibe el evento, mapea a notificación, envía via Web Push VAPID a las suscripciones del destinatario.
3. **Inngest functions** (`packages/inngest`): consumen eventos que requieren scheduling. Llaman a `step.sleepUntil()` y verifican estado.
4. **Failsafe crons** (`supabase/migrations/*_crons.sql`): red de seguridad cada 5 min por si Inngest falla.

---

## 3. Suscripción del cliente

### Flujo

```
1. Usuario instala PWA en Home Screen (o usa en navegador).
2. App detecta soporte Web Push (`'PushManager' in window`).
3. Tras primer login (o tras 30s de uso), prompt "¿Activar notificaciones?".
4. Si usuario acepta:
   a. SW.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })
   b. Recibe PushSubscription con { endpoint, keys: { p256dh, auth } }
   c. POST a /api/v1/push/subscribe con el body
   d. Servidor hace UPSERT en push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
5. Si usuario deniega:
   a. App muestra mensaje "Activa notificaciones para no perderte pedidos"
   b. Botón "Cómo activarlas" abre tutorial
```

### Tabla `push_subscriptions`

```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_successful_at timestamptz,
  last_failed_at timestamptz,
  failure_count int DEFAULT 0,
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_self" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "push_subs_admin_read" ON push_subscriptions
  FOR SELECT USING (current_user_role() = 'admin');
```

### Multi-dispositivo

Un mismo usuario puede tener N suscripciones (celular + tablet + PC). `endpoint` es único por dispositivo. Cuando un push se envía, se itera por TODAS las suscripciones del user.

### Limpieza de suscripciones inactivas

Cron diario `prune-stale-push-subscriptions` borra suscripciones con `failure_count >= 5` OR `last_successful_at < now() - 14 days`.

---

## 4. Outbox + Edge Function send-push

### Trigger Postgres

```sql
CREATE OR REPLACE FUNCTION dispatch_push_for_event()
RETURNS TRIGGER AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Solo dispatchamos eventos que tienen push correspondiente
  IF NEW.event_type NOT IN (
    'OrderReadyForDrivers', 'OrderAssigned', 'OrderOverdue',
    'OrderMarkedUrgent', 'OrderTransferRequested', 'OrderTransferAccepted',
    'OrderTransferRejected', 'OrderTransferExpired', 'OrderTransferAutoAccepted',
    'OrderAcceptedByRestaurant', 'OrderDelivered', 'OrderCancelled',
    'OrderEdited', 'PaymentMethodChanged', 'CashSettlementRequested',
    'CashSettlementConfirmed', 'CashSettlementDisputed', 'CashSettlementResolved',
    'SettlementMarkedPaid', 'BusinessBlocked', 'BusinessUnblocked'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'send_push_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'send_push_url or service_role_key missing';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'event_id', NEW.id,
      'event_type', NEW.event_type,
      'aggregate_id', NEW.aggregate_id,
      'payload', NEW.payload,
      'metadata', NEW.metadata
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_domain_events_dispatch_push
  AFTER INSERT ON domain_events
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_push_for_event();
```

### Edge Function `send-push`

Estructura general (Deno + `web-push` lib):

```ts
// supabase/functions/send-push/index.ts
import webpush from 'npm:web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  'mailto:admin@tindivo.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  // 1. Validar bearer token (service_role)
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Parsear evento
  const { event_type, aggregate_id, payload } = await req.json()

  // 3. Resolver destinatarios según evento (ver §7)
  const recipients = await resolveRecipients(event_type, aggregate_id, payload)
  // Returns: [{ userId, customPayload? }]

  // 4. Para cada destinatario, obtener suscripciones y enviar
  for (const { userId, customPayload } of recipients) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(buildPayload(event_type, payload, customPayload))
        )
        await admin.from('push_delivery_log').insert({
          subscription_id: sub.id, event_type, status: 'ok',
        })
        await admin.from('push_subscriptions').update({
          last_successful_at: new Date(), failure_count: 0,
        }).eq('id', sub.id)
      } catch (err) {
        await admin.from('push_delivery_log').insert({
          subscription_id: sub.id, event_type, status: 'error',
          error_code: err.statusCode, error_message: err.message,
        })
        await admin.from('push_subscriptions').update({
          last_failed_at: new Date(), failure_count: sub.failure_count + 1,
        }).eq('id', sub.id)
        // Si error es 410 Gone, borrar suscripción (endpoint inválido)
        if (err.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
```

### Tag dedup

Cada push tiene `tag: ${event_type}-${shortId}`. Esto:

- Deduplica retries del mismo evento.
- NO colapsa eventos distintos del mismo pedido (porque `event_type` cambia).

**Anti-patrón v1**: usar `tag = shortId` colapsaba `OrderAssigned` con `OrderOverdue` del mismo pedido en FCM, perdiendo el segundo. **Fix en v2**: tag compuesto.

---

## 5. Inngest para scheduling

### Setup

```ts
// packages/inngest/src/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'tindivo',
  signingKey: process.env.INNGEST_SIGNING_KEY!,
})
```

```ts
// apps/api/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@tindivo/inngest/client'
import { 
  checkOrderOverdue,
  processTransferTimeout,
  autoCancelPending,
  closeDriversAtShiftEnd,
} from '@tindivo/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    checkOrderOverdue,
    processTransferTimeout,
    autoCancelPending,
    closeDriversAtShiftEnd,
  ],
})
```

### Function `checkOrderOverdue`

```ts
// packages/inngest/src/functions/check-order-overdue.ts
import { inngest } from '../client'

export const checkOrderOverdue = inngest.createFunction(
  { id: 'check-order-overdue', concurrency: 50 },
  { event: 'order/check-overdue' },
  async ({ event, step }) => {
    // event.data = { orderId, shortId, scheduledFor (ISO string) }

    await step.sleepUntil('wait-for-overdue', event.data.scheduledFor)

    const order = await step.run('fetch-order', async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, short_id, status, driver_id, business_id, businesses(name)')
        .eq('id', event.data.orderId)
        .single()
      return data
    })

    if (!order) return { skipped: 'order-not-found' }
    if (order.status !== 'waiting_driver' || order.driver_id !== null) {
      return { skipped: 'already-assigned-or-cancelled' }
    }

    await step.run('publish-overdue', async () => {
      await supabase.from('domain_events').insert({
        aggregate_type: 'order',
        aggregate_id: order.id,
        event_type: 'OrderOverdue',
        payload: {
          orderId: order.id,
          shortId: order.short_id,
          businessId: order.business_id,
          businessName: order.businesses.name,
        },
      })
    })

    return { published: 'OrderOverdue' }
  }
)
```

### Trigger en use case

```ts
// modules/orders/application/use-cases/create-order.use-case.ts
async execute(cmd: CreateOrderCommand): Promise<Result<Order, DomainError>> {
  // ... lógica de creación ...

  await this.orders.save(order)
  await this.events.publishAll(order.pullEvents())

  // Programar Inngest event
  await this.inngest.send({
    name: 'order/check-overdue',
    data: {
      orderId: order.id.value,
      shortId: order.shortId.value,
      scheduledFor: new Date(
        order.estimatedReadyAt.getTime() + 5 * 60 * 1000
      ).toISOString(),
    },
  })

  return Result.ok(order)
}
```

### Otras functions

**`processTransferTimeout`**: programada al `OrderTransferRequested` con `scheduledFor = createdAt + 30s`. Verifica si sigue pending y aplica timeout-as-accept (revalidando capacidad R3).

**`autoCancelPending`**: programada al crear pedido con source=customer_pwa, `scheduledFor = createdAt + 5min`. Si sigue `pending_acceptance`, cancela.

**`closeDriversAtShiftEnd`**: al cambiar driver a `is_available=true`, programa apagado a `shift_end` del día actual.

### Precisión

Inngest documenta `step.sleepUntil()` con precisión ~2-5 segundos. Suficiente para nuestro objetivo P99 < 5s.

---

## 6. Failsafe crons

Aunque Inngest sea confiable, mantenemos red de seguridad. Cada 5 min:

| Cron | Reemplaza | Función |
|---|---|---|
| `enqueue-overdue-orders-failsafe` | `check-order-overdue` | SELECT orders WHERE status='waiting_driver' AND estimated_ready_at < now() - 5min AND driver_id IS NULL AND not_yet_marked_overdue |
| `process-expired-transfer-requests-failsafe` | `processTransferTimeout` | UPDATE order_transfer_requests SET status='expired' WHERE status='pending' AND created_at < now() - 30s |
| `auto-cancel-pending-acceptance-failsafe` | `autoCancelPending` | UPDATE orders SET status='cancelled' WHERE status='pending_acceptance' AND created_at < now() - 5min |
| `auto-close-drivers-failsafe` | `closeDriversAtShiftEnd` | UPDATE driver_availability SET is_available=false WHERE now() > shift_end |

Los crons solo actúan si Inngest no lo hizo (idempotente: verifican estado actual antes de cambiar).

---

## 7. Mapa de eventos → notificaciones

Lista exhaustiva. Cada fila define: evento → destinatario(s) → contenido → flags de UX.

| # | Evento | Destinatario | Title | Body (template) | requireInteraction | vibrate | URL al tap |
|---|---|---|---|---|---|---|---|
| 1 | `OrderReadyForDrivers` | Todos los drivers disponibles y autorizados | "Nuevo pedido disponible" | "{businessName} · {prepMin} min" | sí | sí | `/disponibles` |
| 2 | `OrderAssigned` | Driver asignado | "Te asignaron un pedido" | "{businessName} · #{shortId}" | sí | sí | `/pedidos/{id}` |
| 3 | `OrderOverdue` | Todos los drivers autorizados | "⏰ Pedido demorado" | "{businessName} · #{shortId} · listo hace {min}min" | sí | sí | `/disponibles` |
| 4 | `OrderMarkedUrgent` | Todos los drivers autorizados | "🚨 URGENTE" | "{businessName} · #{shortId} · sin asignar" | sí | sí | `/disponibles` |
| 5 | `OrderTransferRequested` | Driver dueño actual | "Te piden un pedido" | "{requesterName} quiere #{shortId} · 30s para responder" | sí | sí | `/equipo` |
| 6 | `OrderTransferAccepted` | Driver solicitante | "Pedido recibido" | "#{shortId} ahora es tuyo" | no | no | `/pedidos/{id}` |
| 7 | `OrderTransferRejected` | Driver solicitante | "Solicitud rechazada" | "#{shortId} no fue transferido" | no | no | `/equipo` |
| 8 | `OrderTransferAutoAccepted` | Driver dueño anterior + solicitante | (diferente por kind=from/to) ver §7.1 | ver §7.1 | sí | sí | `/pedidos/{id}` |
| 9 | `OrderTransferExpired` | Driver solicitante | "Solicitud vencida" | "#{shortId}: {reason}" | no | no | `/equipo` |
| 10 | `OrderAcceptedByRestaurant` | Cliente final | "Tu pedido fue confirmado" | "{businessName} confirmó #{shortId} y empezó a prepararlo" | no | no | `/pedidos/{shortId}` |
| 11 | `OrderAccepted` | Negocio | "Driver en camino" | "{driverName} va por #{shortId}" | no | no | `/pedidos/{id}` |
| 12 | `DriverArrived` | Negocio | "Driver llegó" | "{driverName} está en tu local por #{shortId}" | sí | sí | `/pedidos/{id}` |
| 13 | `OrderPickedUp` | Cliente final + Negocio | (Cliente) "Tu pedido salió" / (Negocio) "Pedido recogido" | "{driverName} va camino a la entrega" | no | no | `/pedidos/{shortId}` |
| 14 | `OrderDelivered` | Cliente final + Negocio | (Cliente) "Pedido entregado" / (Negocio) "Pedido entregado" | "Gracias por usar Tindivo" | no | no | `/pedidos/{shortId}` |
| 15 | `OrderCancelled` | Cliente final + Negocio + Driver si aplica | "Pedido cancelado" | "#{shortId} cancelado · {reason}" | no | no | `/pedidos/{shortId}` |
| 16 | `OrderEdited` | Driver asignado | "Pedido actualizado" | "{businessName} actualizó #{shortId}" | no | no | `/pedidos/{id}` |
| 17 | `OrderReadyEarly` | Driver asignado | "Listo antes" | "{businessName} dice que #{shortId} ya está listo" | sí | sí | `/pedidos/{id}` |
| 18 | `OrderExtended` | Driver asignado | "Más tiempo de prep" | "{businessName} pidió +{min}min para #{shortId}" | no | no | `/pedidos/{id}` |
| 19 | `PaymentMethodChanged` | Negocio | "Pago cambió" | "#{shortId} ahora es {newMethod}" | no | no | `/pedidos/{id}` |
| 20 | `CashSettlementRequested` | Negocio | "Efectivo por confirmar" | "{driverName} dice que te entregó S/ {amount}" | sí | no | `/efectivo` |
| 21 | `CashSettlementConfirmed` | Driver | "Efectivo confirmado" | "{businessName} confirmó S/ {amount}" | no | no | `/efectivo` |
| 22 | `CashSettlementDisputed` | Driver + Admin | "Disputa de efectivo" | "{businessName} reportó diferencia" | sí | no | `/efectivo` |
| 23 | `CashSettlementResolved` | Driver + Negocio | "Disputa resuelta" | "Monto final: S/ {amount}" | no | no | `/efectivo` |
| 24 | `SettlementMarkedPaid` | Negocio | "Pago registrado" | "Gracias. Tu liquidación de la semana del {date} fue marcada como pagada" | no | no | `/deuda` |
| 25 | `BusinessBlocked` | Negocio | "Cuenta suspendida" | "Contacta a Tindivo" | sí | no | `/` |
| 26 | `BusinessUnblocked` | Negocio | "Cuenta reactivada" | "Ya puedes operar" | no | no | `/` |

### 7.1 Detalle de `OrderTransferAutoAccepted`

Dos pushes con payloads distintos según `kind`:

- **kind='from'** (al driver que cedió el pedido):
  - title: "Tu pedido fue transferido"
  - body: "{toDriverName} recibió #{shortId} automáticamente"
- **kind='to'** (al driver que recibió):
  - title: "Pedido recibido automáticamente"
  - body: "#{shortId} ahora es tuyo"

### 7.2 Eventos que NO disparan push

Algunos eventos del outbox son solo para auditoría / analytics:

- `OrderCreated`, `OrderReceived`, `OrderAssignmentRejected`, `CustomerDataSaved`.

Estos viajan por outbox pero el trigger los ignora.

---

## 8. Reglas de UX para notificaciones

### 8.1 Cuándo usar `requireInteraction: true`

- Eventos críticos donde el usuario DEBE actuar pronto (asignación, demora, transferencia recibida, urgente, driver llegó al local).
- Sin `requireInteraction`, Android los puede ocultar silenciosamente bajo Doze Mode.

### 8.2 Cuándo NO usar

- Eventos informativos (entregado, confirmado, resuelto, registrado).
- Forzar interacción para informativos molesta al usuario.

### 8.3 Tag y dedup

- **Tag**: siempre `${event_type}-${shortId}` para deduplica retries.
- **NO usar `silent: false`**: algunos browsers tratan como "informativo" y reducen visibilidad. Omitir el campo deja al UA aplicar el default.

### 8.4 Icono y badge

- Icono: logo de la app (192×192) para que aparezca en la notificación.
- Badge: silueta blanca pequeña para Android (mostrado en barra superior).
- Cada app tiene icono distinto (customer naranja, business naranja con dot, driver moto-icon).

### 8.5 Click action

Cada push tiene `data: { url: '/path' }`. El SW al click hace:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientsList) => {
      // Si ya hay una ventana abierta, focusearla y navegar
      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(event.notification.data.url)
          return client.focus()
        }
      }
      // Si no, abrir nueva
      return clients.openWindow(event.notification.data.url)
    })
  )
})
```

### 8.6 Permission gate

Si el usuario denegó permisos:
- Banner persistente "Activa notificaciones para no perderte pedidos".
- Botón "Cómo activarlas" abre un modal con instrucciones específicas por browser/OS.
- NO repetir el prompt nativo (es de un solo uso, si se vuelve a pedir falla silenciosamente).

---

## 9. Limitaciones del SO verificadas

### iOS Safari

- **Requisito**: iOS 16.4+ Y PWA instalada en Home Screen. Sin instalación, NO funciona.
- **Engagement signal**: APNs solo entrega rápido si la app fue abierta recientemente. Si el motorizado no abre la PWA por horas, los pushes pueden tardar minutos.
  - **Mitigación**: pedir al motorizado abrir la app al iniciar turno (banner "Abre tu app al empezar el turno").
- **Sin sonido custom**: el SO controla el sonido. No podemos forzar.

### Android Chrome

- **Doze Mode**: si la batería está baja o el dispositivo lleva tiempo idle, las notificaciones sin `requireInteraction` son tratadas como low priority.
  - **Mitigación**: eventos críticos siempre con `requireInteraction: true + vibrate`.
- **Battery Optimization**: algunas marcas (Huawei, Xiaomi, OPPO) tienen optimización agresiva que mata el SW.
  - **Mitigación**: instrucción al motorizado de desactivar "Battery optimization" para la PWA. Banner "Si no recibes notificaciones, revisa la batería" en `motorizados.tindivo.com`.

### Tags y colapso

- FCM y APNs colapsan notificaciones con el mismo `tag` para evitar spam. Si reusamos tag entre eventos distintos del mismo pedido (e.g., `tag = shortId`), perdemos pushes. **Fix en v2**: `tag = ${event_type}-${shortId}`.

### Múltiples ventanas

- Si el usuario tiene el navegador y la PWA instalada abierta, recibe el push DOS veces (una por cada SW).
  - **Mitigación**: NO mitigamos en v2. Es comportamiento aceptable.

---

## 10. Observabilidad

### Tabla `push_delivery_log`

```sql
CREATE TABLE push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL,                    -- 'ok' | 'error'
  error_code int,                          -- 410, 404, etc.
  error_message text,
  at timestamptz DEFAULT now()
);
CREATE INDEX push_delivery_log_at_idx ON push_delivery_log (at DESC);

-- En v2: RLS activada (en v1 estaba sin RLS)
ALTER TABLE push_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_log_admin_only" ON push_delivery_log
  FOR SELECT USING (current_user_role() = 'admin');
```

### Métricas a vigilar

- **Tasa de entrega**: `ok / (ok + error)` por día. Objetivo: ≥ 95%.
- **Tasa de 410 Gone** (suscripción inválida): debe ser < 10% (si más, hay problema en el SW del cliente).
- **Latencia P99**: medida desde `domain_events.occurred_at` hasta `push_delivery_log.at`. Objetivo: < 5s.
- **Suscripciones activas**: cuenta de `push_subscriptions` con `last_successful_at > now() - 7d`.

### Retención

- `push_delivery_log` con TTL 30 días via cron `prune-push-delivery-log` diario.

### Dashboard admin

En `admin.tindivo.com/diagnostico/push` (post-MVP) se muestra:
- Heatmap de entregas por hora.
- Top 10 endpoints con más errors.
- Latencia promedio últimas 24h.

---

## 11. Configuración VAPID

### Generar claves

```bash
npx web-push generate-vapid-keys
# Public Key: B...
# Private Key: ...
```

### Variables de entorno

```env
# Cliente (público, va al bundle)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="B..."

# Servidor (en Vercel + Supabase Vault)
VAPID_PUBLIC_KEY="B..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:admin@tindivo.com"
```

### En Edge Function

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` están en Supabase Vault y son leídos al iniciar la función:

```ts
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)
```

### Rotación de claves

NO recomendado en MVP. Cambiar VAPID invalida TODAS las suscripciones existentes (todos los usuarios deben re-suscribirse). Solo rotar si la private key se filtra.

---

## 12. Recomendaciones para el usuario final

### Para el motorizado (crítico)

- **Instalar la PWA en Home Screen** (Android: menú → "Agregar a pantalla de inicio"; iOS: Compartir → "Agregar a pantalla de inicio").
- **Permitir notificaciones** al primer login.
- **Desactivar optimización de batería** para la app (Android Settings → Apps → Tindivo Motorizados → Battery → No optimizar).
- **Mantener el celular cargado** durante el turno.
- **Abrir la app al iniciar turno** para "calentar" la conexión (importante para iOS).

### Para el cliente final (informativo)

- Push notifications son opcionales. Si denegaste, recibirás info por WhatsApp.
- Si quieres activarlas: configuración del navegador → permisos → notificaciones → permitir para `tindivo.com`.

### Para el negocio (importante)

- Push notifications son recomendadas. Activa al primer login.
- Si trabajas en tablet conectada a corriente, los pushes son confiables.

---

**Resumen ejecutivo**: el bug de v1 se resuelve con Inngest scheduling event-driven + outbox + Edge Function. P99 < 5s alcanzable. Failsafe crons de 5 min como red de seguridad. Tag dedup correcto. RLS activada en `push_delivery_log` y `push_subscriptions`. Limitaciones del SO documentadas y mitigadas con instrucciones al usuario.
