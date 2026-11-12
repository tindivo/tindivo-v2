// El seguimiento del pedido en la notificación de Android: una sola notificación por pedido o
// entrega, que se actualiza en cada momento. Piezas puras, sin imports de Deno, para probarlas
// desde vitest (apps/api/lib/__tests__/send-push-order-tracking.test.ts).

/**
 * Cuánto puede guardar FCM un aviso de pedido o de Entregas para un teléfono sin red: 3 horas.
 * Pasado eso un estado ya es viejo (el pedido se entregó o se canceló) y mostrarlo días después
 * confunde más de lo que informa.
 */
export const TRACKING_TTL_SECONDS = 3 * 60 * 60

/**
 * Llave de presentación de un pedido de restaurante. Todos sus avisos la comparten, así que en
 * Android cada uno reemplaza al anterior. No es el `tag` (ver `buildFcmMessage` en `native.ts`).
 */
export function orderGroup(shortId: string): string {
  return `order-${shortId}`
}

/** Llave de presentación de una entrega de Tindivo Entregas. */
export function courierGroup(shortId: string): string {
  return `courier-${shortId}`
}

/** Lo que un aviso de seguimiento aporta a la nota; destinatario, `tag` y urgencia los pone quien llama. */
export type TrackingNotice = {
  title: string
  body: string
  url: string
  group: string
  ttlSeconds: number
  /**
   * Solo a la app nativa. La web del cliente está congelada para pedidos: los momentos nuevos no
   * se mandan por Web Push.
   */
  nativeOnly: true
}

/** «el restaurante» → «El restaurante» al empezar una frase. */
function sentence(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

function orderNotice(shortId: string, title: string, body: string): TrackingNotice {
  return {
    title,
    body,
    url: `/pedido/${shortId}`,
    group: orderGroup(shortId),
    ttlSeconds: TRACKING_TTL_SECONDS,
    nativeOnly: true,
  }
}

/**
 * `ready` de un pedido a domicilio: la comida está lista. Si todavía no hay motorizado (lo normal:
 * el pedido pasa a `waiting_driver`), se le dice al cliente que se está asignando uno. Si ya lo
 * había tomado uno mientras se cocinaba (`take` antes de `ready`, permitido desde la cola), decirle
 * «estamos asignando» sería falso: se le dice que el motorizado ya va por él.
 */
export function deliveryReadyNotice(
  shortId: string,
  bizName: string,
  driverAssigned: boolean,
): TrackingNotice {
  const done = `${sentence(bizName)} lo terminó`
  return orderNotice(
    shortId,
    'Tu pedido está listo',
    driverAssigned
      ? `${done} · el motorizado ya va por él`
      : `${done} · estamos asignando a un motorizado`,
  )
}

/** `take`: un motorizado tomó el pedido y va al local. */
export function driverTookNotice(shortId: string, driverName: string, bizName: string): TrackingNotice {
  return orderNotice(
    shortId,
    `${driverName || 'Un motorizado'} va por tu pedido`,
    `Lo recoge en ${bizName}`,
  )
}

/** `arrived`: el motorizado llegó al local. */
export function driverAtBusinessNotice(
  shortId: string,
  driverName: string,
  bizName: string,
): TrackingNotice {
  return orderNotice(
    shortId,
    `${driverName || 'El motorizado'} llegó a ${bizName}`,
    'Está recogiendo tu pedido',
  )
}

/** Entregas `release`: el motorizado la soltó y vuelve a la bolsa; para el cliente, sigue en pie. */
export function courierReleasedNotice(shortId: string): TrackingNotice {
  return {
    title: 'Buscamos otro motorizado',
    body: 'El anterior no pudo llevar tu entrega · sigue en pie',
    url: `/entregas/${shortId}`,
    group: courierGroup(shortId),
    ttlSeconds: TRACKING_TTL_SECONDS,
    nativeOnly: true,
  }
}

// ── Progreso en la notificación (seguimiento fijo en Android) ───────────────

/**
 * En qué paso va un pedido o una entrega, para la barra de la notificación de Android. Viaja en
 * `data` como `step`/`steps`/`terminal` (texto, `packages/contracts/src/native-push.ts`).
 *
 * - `step`/`steps`: paso actual y total (1 ≤ step ≤ steps). Sin ellos no hay barra.
 * - `terminal`: el estado es final (entregado o cancelado): la notificación deja de ser fija.
 *   Un cancelado no lleva paso: no hay barra que llenar.
 */
export type TrackingProgress = { step?: number; steps?: number; terminal: boolean }

/** Pedido a domicilio: Recibido → Preparando → Listo → En camino → Entregado. */
export const DELIVERY_STEPS = 5
/** Pedido para recoger: Recibido → Preparando → Listo para recoger → Entregado. */
export const PICKUP_STEPS = 4
/** Entregas: Buscando motorizado → Motorizado asignado → En camino → Entregado. */
export const COURIER_STEPS = 4

const at = (step: number, steps: number): TrackingProgress => ({ step, steps, terminal: false })
const done = (steps: number): TrackingProgress => ({ step: steps, steps, terminal: true })
const CANCELLED: TrackingProgress = { terminal: true }

/**
 * El paso de un pedido de restaurante según su estado REAL en la base (`orders.status`, los de
 * `ORDER_STATUSES` en `packages/contracts/src/enums.ts`) y su método de entrega.
 *
 * `waiting_driver`, `heading_to_restaurant` y `waiting_at_restaurant` son el paso «Listo»: la
 * comida salió de cocina (o está por salir) y falta que un motorizado se la lleve. Si un
 * motorizado tomó el pedido antes de que estuviera listo (`take` desde la cola), la barra ya marca
 * «Listo» con la comida todavía en el fuego: el estado no distingue ese caso. Un estado que no
 * corresponde al método (p. ej. `picked_up` en un recojo) o desconocido da `null`: sin barra.
 */
export function orderProgress(status: string, deliveryMethod: string): TrackingProgress | null {
  const pickup = deliveryMethod === 'pickup'
  const steps = pickup ? PICKUP_STEPS : DELIVERY_STEPS
  switch (status) {
    case 'validando':
    case 'pending_acceptance':
    case 'awaiting_payment':
    case 'confirmed':
      return at(1, steps)
    case 'preparing':
      return at(2, steps)
    case 'waiting_driver':
    case 'heading_to_restaurant':
    case 'waiting_at_restaurant':
      return pickup ? null : at(3, steps)
    case 'picked_up':
      return pickup ? null : at(4, steps)
    case 'ready_for_pickup':
      return pickup ? at(3, steps) : null
    case 'delivered':
      return done(steps)
    case 'cancelled':
      return CANCELLED
    default:
      return null
  }
}

/**
 * El paso de una entrega según `courier_orders.status` (`COURIER_STATUSES`). Cuando el motorizado
 * la suelta (`release`) la entrega vuelve a `requested`: la barra vuelve al paso 1.
 */
export function courierProgress(status: string): TrackingProgress | null {
  switch (status) {
    case 'requested':
      return at(1, COURIER_STEPS)
    case 'accepted':
    case 'heading_to_pickup':
    case 'at_pickup':
      return at(2, COURIER_STEPS)
    case 'picked_up':
    case 'heading_to_dropoff':
      return at(3, COURIER_STEPS)
    case 'delivered':
      return done(COURIER_STEPS)
    case 'cancelled':
      return CANCELLED
    default:
      return null
  }
}
