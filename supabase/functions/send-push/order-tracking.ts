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
