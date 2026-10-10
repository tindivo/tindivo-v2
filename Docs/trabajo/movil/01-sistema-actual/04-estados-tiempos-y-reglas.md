# 04 · Estados, transiciones, plazos y quién puede qué

> Fuente: `packages/contracts/src/order-status.ts`, `advance_order` (leída por acciones), `DECISIONS.md`
> (contrastado con código) y `app_settings` vivo. Requisitos formales: `../03-requisitos/SYS-transversal.md`.

## 1. La máquina de estados

```
 DELIVERY
   [validando]* ─► pending_acceptance ─► confirmed ─► preparing ─► waiting_driver ─► heading_to_restaurant
        │                │  ▲                                                             │
        │                ▼  │ (rechazo con reintento)                                     ▼
        │          awaiting_payment ─► validando(con captura) ─► confirmed        waiting_at_restaurant
        │                                                                                 │
        └──────────────────────────────────────────────────────────────────────  picked_up ─► delivered ■

 RECOJO
   [validando]* ─► pending_acceptance ─► preparing ─► ready_for_pickup ─► delivered ■

 (cualquier estado no terminal) ─► cancelled ■        * solo contraentrega de cliente nuevo/con strike/monto grande
```

- **12 estados:** `validando`, `pending_acceptance`, `awaiting_payment`, `confirmed`, `preparing`,
  `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant`, `picked_up`, `ready_for_pickup`,
  `delivered`, `cancelled`.
- **Terminales:** `delivered`, `cancelled`. **Nadie saca un pedido de `delivered`** (invariante 8).
- **`ready_for_pickup`** es un estado propio: no se reutilizó `waiting_driver` (que mete el pedido en la
  cola de motorizados) ni `picked_up` (que arranca el reloj de reparto y congela la comisión).
- **Prepago:** `pending_acceptance` (el negocio confirma) → `awaiting_payment` (el cliente paga y sube
  captura) → `validando` con captura (la cajera revisa) → `confirmed` → `preparing`. Un rechazo con
  intento restante vuelve a `awaiting_payment`.

## 2. Quién escribe qué

| Transición / acción | Actor | Función SQL | Ruta |
|---|---|---|---|
| Crear (cliente) → `pending_acceptance` / `validando` | Cliente | `create_customer_order` | `POST /customer/orders` |
| Crear (cajera) → `preparing` | Negocio | `create_business_manual_order` | `POST /business/orders` |
| `accept` | Negocio | `advance_order` | `POST /business/orders/:id/transition` |
| Validar llamada / comprobante | Negocio (o admin) | `validate_order` | `POST /business/orders/:id/validate` |
| Subir comprobante → `validando` | Cliente | *(UPDATE directo de la ruta)* | `POST /customer/orders/:id/prepay-proof` |
| `ready` | Negocio | `advance_order` | `…/transition` |
| `take`, `arrived`, `pickup`, `arrived_customer`, `deliver`, `release`, `no_show` | Motorizado | `advance_order` | `POST /driver/orders/:id/transition` |
| `handover`, `pickup_no_show` | Negocio | `advance_order` | `…/transition` |
| `cancel` | Cliente (ventana) | `cancel_customer_order` | `POST /customer/orders/:id/cancel` |
| `cancel` | Negocio / admin | `advance_order` | `…/transition`, `POST /admin/orders/:id/cancel` |
| Vencimientos | Sistema | `expire_order`, `cancel_expired_prepay_orders` | Inngest + `pg_cron` |
| Traspaso | Motorizado | `request_order_transfer`, `respond_order_transfer`, `apply_order_transfer` | `/driver/…` |
| Extender preparación | Negocio | `extend_order_prep` | `POST /business/orders/:id/extend-prep` |

**Las 8 funciones que escriben `orders.status`:** `advance_order`, `expire_order`,
`apply_order_transfer`, `cancel_customer_order`, `cancel_expired_prepay_orders`, `extend_order_prep`,
`validate_order`, `create_customer_order`. (Más el `UPDATE` de `prepay-proof`.)

## 3. Proyección al cliente (4 pasos)

| Estado | Paso que ve el cliente |
|---|---|
| `validando`, `pending_acceptance`, `awaiting_payment`, `confirmed` | **Recibido** |
| `preparing`, `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant` | **Preparando** |
| `picked_up`, `ready_for_pickup` | **En camino** (recojo: «Listo para recoger») |
| `delivered` | **Entregado** |
| `cancelled` | Se muestra aparte |

**Nota de diseño:** dentro de «Recibido» caben las tres esperas del prepago; por eso la pantalla las
pinta con un **riel propio** (`prepayStage`) y solo uno de los dos indicadores es visible a la vez.

## 4. Ventana de cancelación

| Quién | Cuándo |
|---|---|
| **Cliente** | Contraentrega: `validando` y `pending_acceptance`. **Prepago: solo `pending_acceptance`** (sin dinero de por medio). Después, soporte. |
| **Negocio** | En `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant` (y antes de aceptar, rechazando) |
| **Admin** | Además en `picked_up` (con advertencia) |
| **Motorizado** | **Nunca cancela**; reporta (`no_show`) |
| **Sistema** | Por vencimiento de plazos (ver abajo) |

Motivos (`cancel_reason`): `pending_acceptance_timeout`, `validation_timeout`, `prepay_timeout`,
`business_cancelled`, `admin_cancelled`, `customer_cancelled`, `no_show`, `proof_rejected_final`.

## 5. Plazos (⚙ `app_settings.timers`)

| Plazo | Valor | Qué pasa al vencer | Quién cuenta |
|---|---|---|---|
| Aceptación del negocio | **8 min** (desde `pending_acceptance_at`) | `pending_acceptance_timeout` | Inngest + cron |
| Pago del cliente (prepago) | **15 min** (desde `awaiting_payment_at`) | `prepay_timeout` | Inngest + cron |
| Verificación del comprobante | **10 min** (desde `validating_at`) | `prepay_timeout` | Inngest + cron |
| Validación por llamada | **5 min** | `validation_timeout` | Inngest + cron |
| Espera del motorizado en la puerta | **5 min** | Permite declarar `no_show` | persona |
| Extensión de preparación | +**10** min, máx. **2** | — | negocio |
| Lead de cola | **10 min** | `OrderQueued` | cron |
| Trayecto publicado | **20-25 min** | ETA en rango | — |
| Traspaso | **30 s** (callarse cede) | `apply_order_transfer` | cron + Inngest |
| Reparto tardío | **20 min** | El reloj se pone rojo | cliente |
| Reseña | **21 días** | Se deja de preguntar | `get_pending_review` |
| Bloqueo total por strikes | **30 días** | `blocked_until` | — |
| Apelación | **24 h** | Revisión de respaldo (`create_fallback_appeal_review`) | Inngest |

Los crons corren **cada minuto**: un vencimiento puede tardar hasta 60 s en aplicarse; la UI lo dice
(«Confirmando…»).

## 6. Qué puede cada rol (resumen)

| | Cliente | Negocio | Motorizado | Admin |
|---|---|---|---|---|
| Crear pedido | ✔ (web) | ✔ (manual) | — | — |
| Aceptar / rechazar | — | ✔ | — | ✔ (escala) |
| Cancelar | ventana | ✔ | **nunca** | ✔ (incl. `picked_up`) |
| Validar comprobante / llamada | — | ✔ | — | ✔ |
| Tomar / recoger / entregar | — | — | ✔ | — |
| Cobrar efectivo | — | confirma | ✔ (declara) | resuelve discrepancias |
| Cambiar banda de envío | — | ✔ (al crear manual) | **no** | ✔ (corrige) |
| Ver reseña completa | — | nota y etiquetas | — | ✔ |

## 7. Lo que esto implica para un cliente nativo

1. **La app no calcula estados**: recibe el `status` y un modelo de lectura con `steps[]`, `eta`,
   `deadline` y `actions[]` (qué botones ofrecer). Así los cuatro pasos, el ETA y la ventana de
   cancelación dejan de estar en tres lenguajes (`ARQ-03`).
2. **Hay que soportar estados que hoy la PWA trata a medias** (`awaiting_payment`, `ready_for_pickup`
   en el historial: `CUS-ORD-002`).
3. **Los plazos se reciben** del servidor y la cuenta atrás usa el reloj del servidor (hay desfase de
   reloj entre teléfono y base; el arco se acota a [0,1]).
