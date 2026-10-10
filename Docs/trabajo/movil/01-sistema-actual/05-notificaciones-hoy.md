# 05 · Notificaciones: cómo funcionan hoy

> Descripción del pipeline **actual**. Los hallazgos y el rediseño para APNs/FCM están en
> `../02-auditoria-backend/03-notificaciones.md` y `../03-requisitos/NAT-capacidades-nativas.md`.
> Fuente: `supabase/functions/send-push/index.ts` (1 127 líneas), `dispatch_event`,
> `apps/api/app/api/v1/push/subscriptions/*`, `apps/customer/lib/push.ts`, `DECISIONS.md §11, §25`.

## 1. El camino de un aviso

```
RPC (advance_order, create_customer_order, validate_order…)
   └─ INSERT en domain_events                   ← MISMA transacción que el cambio de estado  ✔
        └─ trigger AFTER INSERT: dispatch_event
             ├─ filtra por una LISTA BLANCA de 14 tipos de evento (el resto es auditoría)
             ├─ lee app_settings.push_dispatch  → { url de la Edge Function, anonKey }
             └─ net.http_post(...)  con  Authorization: Bearer <anonKey>      ← a fondo perdido ✖
                  └─ Edge Function send-push (Deno, verify_jwt = true)
                       ├─ buildNotes(): resuelve DESTINATARIOS y arma el TEXTO (es-PE)  [5-8 consultas]
                       ├─ push_subscriptions  (por user_id)
                       ├─ web-push (VAPID) → endpoint del navegador   [sin TTL ni urgencia]
                       ├─ push_delivery_log  (ok | error + código)
                       └─ 404/410 → borra la suscripción
```

- **Transaccional al crear el evento, pero no al entregarlo:** si `net.http_post` o la función fallan,
  nadie reintenta y `domain_events.published_at` **no lo escribe nadie** (0 de 5 620).
- **Sin destinatarios = sin rastro:** si el usuario no tiene suscripción no se escribe nada en el log.
- **Registro de suscripciones:** `POST /push/subscriptions` (autenticado; `endpoint`, `keys.p256dh`,
  `keys.auth`, `userAgent`, `installId`), `GET /push/subscriptions/me?endpoint=` (¿es mía?),
  `DELETE`. Un cron diario borra las que llevan **14 días fallando** sin éxito reciente.

## 2. Suscripción por app

| App | ¿Suscribe? | Cómo |
|---|---|---|
| `motorizados` | **Sí**, desde siempre | Al entrar; reconciliación |
| `negocios` | Sí (arreglado el 2026-09-11) | Idem |
| `customer` | Sí, **solo si el cliente acepta** | Hoja explicativa en el seguimiento; una vez por pedido; máx. 2 descartes; reconciliación cada 60 s (`lib/push.ts`) |
| `admin` | 1 usuario | — |

En iOS el permiso solo se puede pedir con la PWA **instalada** en la pantalla de inicio (16.4+).

## 3. Eventos y a quién van

Los 14 tipos de la lista blanca y sus destinatarios (`buildNotes`):

| Evento (`event_type` / `action`) | Destinatario(s) | Notas |
|---|---|---|
| `OrderStatusChanged` · `accept` | **Cliente** (prepago: «Ya puedes pagar» **Req.**; resto: «aceptó tu pedido») + **todos los motorizados** (aviso anticipado si `prep > 10` min, delivery, en `preparing`) | El recojo dice «te avisamos cuando puedas pasar» |
| · `ready` (**recojo**) | Cliente **Req.** + negocio | Nadie en moto |
| · `ready` (**delivery**) | **Todos los motorizados activos** («⚡ ¡Listo para llevar!» **Req.**, `renotify`) | Sin filtrar por disponibilidad |
| · `take` | Negocio | «Motorizado en camino» |
| · `arrived` | Negocio **Req.** | «Motorizado en tu local» |
| · `pickup` | Cliente («Tu pedido salió», con nombre de pila) + negocio | Sin ETA a propósito |
| · `arrived_customer` | **Cliente Req.** («… está en tu puerta») | Arranca el reloj de no-show |
| · `no_show` | Cliente **Req.** + negocio | |
| · `validate_fail_retry` · `validate_fail` | Cliente **Req.** | 1 intento restante / cancelación |
| · `handover` · `pickup_no_show` | Cliente (+ negocio) | Invitación / cancelación |
| · `deliver` | Cliente + negocio | «S/ X · gracias» |
| · `cancel` | Cliente + negocio (con el motivo) + **motorizado asignado** («❌ CANCELADO», **Req.**) | El motivo interno **no** va al cliente |
| `OrderExpired` | Cliente | «No llegó el pago a tiempo» |
| `OrderProofVerified` · `OrderValidated` | Cliente | Cierran una espera sin acción posible |
| `OrderCreated` | **Negocio** (pedido del cliente en `pending_acceptance`/`validando`: «Nuevo pedido» **Req.**) + motorizados (aviso anticipado del manual) | |
| `OrderQueued` | Todos los motorizados («🥡 Por salir» **Req.**) | Emitido por cron por reloj |
| `OrderReleased` | Todos los motorizados **menos** quien lo soltó | |
| `OrderOverdue` | Todos los motorizados | Una vez; sella `urgent_since` |
| `TransferRequested` · `TransferResolved` | Dueño / solicitante (varios casos) | **Tags distintos** en el doble aviso |
| `CashDelivered` | Negocio | Colapsado por (motorizado, negocio) |
| `CashConfirmed` · `CashDisputed` · `CashResolved` | Motorizado | Idem |

**No se notifican a propósito:** `BusinessBlocked`, `CustomerNoShow`, `OrderPrepExtended`,
`order/appeal.created` (decisión de producto, lista blanca explícita).

**Req.** = `requireInteraction` + vibración `[300, 100, 300, 100, 500]` (conceptos de Web Push).

## 4. Forma del mensaje (Web Push)

```json
{ "title": "…", "body": "…", "tag": "<EventType>-<action>-<shortId>", "url": "/pedido/ABC12345",
  "requireInteraction": true, "renotify": true, "vibrate": [300,100,300,100,500] }
```

- El **`tag`** incluye el tipo de evento (invariante 5: el v1 usaba solo el `shortId` y colapsaba
  `OrderAssigned` con `OrderOverdue`).
- Dos tags superan el límite de APNs (64 B): `CashConfirmed-<uuid>-<uuid>` (87), `TransferResolved-expired-from-<uuid>` (59).
- **Sin `TTL` ni `Urgency`**: valen los de la librería (4 semanas, normal).

## 5. Operación y fallos conocidos

| Qué | Detalle |
|---|---|
| Configuración | Llaves VAPID como secretos de la Edge Function; `push_dispatch` en `app_settings` |
| Despliegue | Tercer paso, aparte de la base y de Vercel (`supabase functions deploy send-push`); versión viva **12** |
| **Incidente VAPID (2026-08-01)** | Una llave mal pegada mató el *worker* al arrancar: **cero notificaciones y cero señal de la causa durante dos meses** → ahora captura el fallo de arranque y responde 500 con el motivo |
| **Incidente de motorizados** | Una consulta fallida daba «0 destinatarios, 200»: **tres días de diagnóstico** → ahora propaga el error |
| **Segundo camino de push (0136)** | El aviso a la cajera salía por Inngest con otra pareja VAPID y un `tag` constante (`'new-order'`) que colapsaba pedidos seguidos → unificado en `send-push` |
| **Filtro por disponibilidad (v1 → v2)** | Filtrar avisos por `is_available` dejaba a los motorizados en un limbo tras el cierre de turno → «notificar no es asignar» |
| **Sonido** | Depende de un `AudioContext` que el navegador suspende; el aviso puede llegar y no sonar |
| **Alcance** | 26 suscripciones; **11 de 77** clientes (0 en iPhone) |
| **Entrega** | 7 764 ok / 4 error `410` (últimos ≤ 30 días): el problema no es el envío |
