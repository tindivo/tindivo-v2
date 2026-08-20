import type { TrackingStep } from '@tindivo/contracts'
import type { Tracking } from '@/features/tracking/types'

export { soles } from '@/lib/format'

/**
 * Los cuatro pasos que ve el cliente. `short` es para el stepper horizontal, que
 * tiene un cuarto del ancho de la pantalla por etiqueta.
 *
 * El subtítulo de `received` NO promete una llamada. Decía «El restaurante te
 * llamará para confirmar» y se lo enseñaba a todo el mundo, cuando la llamada
 * antifraude solo alcanza a contraentrega de cliente nuevo, con strike o de monto
 * grande (`DECISIONS.md §7`) — al prepago no se le llama nunca. O sea que se lo
 * prometíamos a casi todos y lo cumplíamos con casi ninguno, que es la peor
 * combinación: el que no recibe la llamada se queda esperando un teléfono que no
 * va a sonar en vez de mirar su pedido.
 */
export const STEPS: { key: TrackingStep; label: string; short: string; sub: string }[] = [
  {
    key: 'received',
    label: 'Pedido recibido',
    short: 'Recibido',
    sub: 'Estamos confirmándolo con el restaurante',
  },
  { key: 'preparing', label: 'Preparando', short: 'Preparando', sub: 'Tu pedido está en cocina' },
  { key: 'ontheway', label: 'En camino', short: 'En camino', sub: 'El motorizado va en ruta' },
  { key: 'delivered', label: 'Entregado', short: 'Entregado', sub: '¡Buen provecho!' },
]

/**
 * Copy de la pantalla de cancelado (DECISIONS §estados / prototipo).
 *
 * Ramifica por método de pago además de por motivo: para un prepago con
 * comprobante subido, "no se te cobró nada" es falso — el dinero ya salió a la
 * cuenta del restaurante. Ninguno de estos textos promete ni niega una
 * devolución: la política está sin decidir, y prometer de más es peor que no
 * decir nada.
 */
export function cancelledCopy(
  reason: string | null,
  opts?: { paymentIntent?: string; proofUrl?: string | null },
): {
  eyebrow: string
  title: string
  body: string
} {
  // Pagó de verdad: prepago con comprobante subido.
  const yaPago = opts?.paymentIntent === 'prepaid' && Boolean(opts?.proofUrl)

  switch (reason) {
    case 'customer_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelaste tu pedido',
        body: yaPago
          ? 'Cancelaste tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Tu pedido fue cancelado sin costo porque aún no estaba confirmado por el restaurante. Puedes volver a pedir cuando quieras.',
      }
    case 'prepay_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Se acabó el tiempo para pagar',
        body: 'Tu pedido fue cancelado porque no recibimos tu comprobante a tiempo. Puedes volver a pedir cuando quieras.',
      }
    case 'validation_timeout':
    case 'pending_acceptance_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos confirmar tu pedido',
        body: yaPago
          ? 'El restaurante no respondió a tiempo, así que cancelamos tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'El restaurante no respondió a tiempo, así que cancelamos tu pedido sin costo. Puedes intentarlo de nuevo.',
      }
    case 'business_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'El restaurante canceló tu pedido',
        body: yaPago
          ? 'Lamentablemente el restaurante no pudo tomar tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Lamentablemente el restaurante no pudo tomar tu pedido. No se te cobró nada. Puedes pedir en otro momento.',
      }
    case 'admin_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelamos tu pedido',
        body: yaPago
          ? 'Tuvimos que cancelar tu pedido. Como ya habías enviado tu pago, escríbenos por WhatsApp para coordinarlo.'
          : 'Tuvimos que cancelar tu pedido. Si quieres saber qué pasó, escríbenos por WhatsApp.',
      }
    case 'proof_rejected_final':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos verificar tu pago',
        body: 'El restaurante no pudo confirmar el comprobante que enviaste. Si crees que hubo un error, escríbenos por WhatsApp.',
      }
    case 'no_show':
      // Sin acusar: el motorizado pudo no dar con la puerta, y el cliente pudo
      // no oír la llamada. Tampoco se menciona el dinero — la política está en
      // backlog y prometer una devolución que no está decidida sería peor.
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos entregarte el pedido',
        body: 'El motorizado llegó a la dirección y no logró encontrarte. El pedido volvió al restaurante. Escríbenos por WhatsApp y lo vemos contigo.',
      }
    default:
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Tu pedido fue cancelado',
        body: 'Tu pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.',
      }
  }
}

/**
 * Qué se le enseña al cliente sobre cuándo llega su pedido.
 *
 * Lo que había antes contaba los minutos hasta `estimated_ready_at` —cuándo la
 * comida está LISTA, no cuándo llega— y, si ese campo venía nulo, devolvía un
 * "25–35 min" inventado. Las dos cosas eran mentira en direcciones opuestas.
 *
 * Ahora: ETA = estimated_ready_at + rango de trayecto, y si no hay base para
 * calcularlo no se enseña nada. Nunca una hora exacta: siempre un rango.
 */
export type EtaView =
  | { kind: 'none' }
  | { kind: 'ready' }
  | { kind: 'imminent' }
  | { kind: 'range'; min: number; max: number }

export function etaView(data: Tracking, now: number = Date.now()): EtaView {
  // 1. El motorizado ya está en la puerta. La tarjeta de llegada con el
  //    WhatsApp ocupa ese sitio; dos mensajes compitiendo confunden.
  if (data.arrivedAtCustomerAt) return { kind: 'none' }
  if (data.status === 'delivered' || data.status === 'cancelled') return { kind: 'none' }

  // 2. La cajera marcó listo antes de tiempo. Desde la 0120 eso RECORTA
  //    `estimated_ready_at` al lead de cola (10 min) en vez de dejarlo con la
  //    hora vieja, así que el reloj ya no anuncia cocción que no existe y el
  //    rango se puede calcular igual que en cualquier otro pedido: la comida
  //    está hecha, pero la entrega todavía necesita que un motorizado pase por
  //    el local. Solo cuando ese margen ya venció se dice "listo" sin número.
  if (data.readyEarlyUsed && !data.estimatedReadyAt) return { kind: 'ready' }

  // 3. Sin reloj de cocción no hay nada que calcular. Pasa en
  //    `awaiting_payment`: el reloj no arranca hasta verificar el comprobante.
  if (!data.estimatedReadyAt) return { kind: 'none' }

  const ready = Date.parse(data.estimatedReadyAt)
  if (!Number.isFinite(ready)) return { kind: 'none' }

  const travel = data.travelMinutes ?? { min: 20, max: 25 }
  const min = Math.ceil((ready + travel.min * 60_000 - now) / 60_000)
  const max = Math.ceil((ready + travel.max * 60_000 - now) / 60_000)

  // Dentro de la ventana o pasada: un rango negativo no dice nada.
  if (min <= 0) return { kind: 'imminent' }
  return { kind: 'range', min, max }
}

/** El texto del ETA, o `null` si no hay nada que enseñar. */
export function etaLabel(data: Tracking, now: number = Date.now()): string | null {
  const v = etaView(data, now)
  if (v.kind === 'none') return null
  if (v.kind === 'ready') return 'Ya está listo'
  if (v.kind === 'imminent') return 'En cualquier momento'
  return `${v.min}–${v.max} min`
}

/**
 * El subtítulo del paso, afinado por estado. Pide solo `key` y `sub` y no el
 * `STEPS[0]` entero: el hero construye un paso de emergencia si el índice se
 * sale de la lista, y ese no tiene por qué traer la etiqueta corta del stepper.
 */
export function getStepSub(s: Pick<(typeof STEPS)[0], 'key' | 'sub'>, data: Tracking): string {
  if (s.key === 'received' && data.paymentIntent === 'prepaid') {
    if (data.status === 'pending_acceptance' || (data.status === 'validando' && !data.proofUrl)) {
      return 'Esperando confirmación de disponibilidad'
    }
    if (data.status === 'awaiting_payment') return 'Restaurante confirmó. Paga ahora'
    if (data.status === 'validando' && data.proofUrl) return 'Verificando tu comprobante de pago'
    if (data.status === 'confirmed') return 'Pago verificado. En preparación'
  }
  return s.sub
}

/** Mensaje informativo del footer según estado y método de pago. */
export function getStatusMessage(data: Tracking, current: TrackingStep | null): string {
  if (current === 'delivered') return '¡Tu pedido fue entregado! Buen provecho.'

  // El pedido ya salió del local. Estos dos casos caían al mensaje genérico del
  // final, que decía «ya está en preparación» con el motorizado tocando el
  // timbre. Van antes que la rama de prepago porque un prepago en camino
  // también se comía ese texto.
  if (data.arrivedAtCustomerAt) {
    return 'El motorizado ya llegó a tu domicilio y te está esperando.'
  }
  if (current === 'ontheway') {
    return data.paymentIntent === 'pending_cash'
      ? 'Tu pedido ya salió del restaurante. Ten listo tu pago.'
      : 'Tu pedido ya salió del restaurante y va en camino.'
  }

  if (data.paymentIntent === 'prepaid') {
    // Solo en `pending_acceptance` se ofrece cancelar, y el mensaje lo dice: es
    // la única fase del prepago sin dinero de por medio (`0169`). En
    // `validando` sin comprobante la frase es la misma sin esa última parte,
    // porque ahí la RPC ya no deja — prometerlo sería mandar al cliente contra
    // un botón que no existe.
    if (data.status === 'pending_acceptance') {
      return 'El restaurante confirmará disponibilidad para que puedas realizar el pago. Aún puedes cancelarlo.'
    }
    if (data.status === 'validando' && !data.proofUrl) {
      return 'El restaurante confirmará disponibilidad para que puedas realizar el pago.'
    }
    if (data.status === 'awaiting_payment') {
      return 'Realiza tu pago por Yape/Plin y sube tu comprobante para iniciar la preparación.'
    }
    if (data.status === 'validando' && data.proofUrl) {
      return 'Tu comprobante está en revisión por el restaurante.'
    }
    return 'Tu pedido ya está en preparación y no puede cancelarse.'
  }

  // Contraentrega en revisión. Antes caía al mensaje genérico de abajo, que
  // afirmaba dos cosas falsas: que estaba en preparación (está en `validando`)
  // y que no podía cancelarse (cancel_customer_order SÍ admite `validando`
  // para no-prepago, 0046:25-27).
  //
  // Tampoco anuncia ya una llamada. El estado sigue existiendo y la cajera sigue
  // resolviéndolo desde su panel; lo que se retira es la promesa de que el
  // teléfono va a sonar, que no se cumple para la mayoría.
  if (data.status === 'validando') {
    return 'Estamos confirmando tu pedido antes de mandarlo a cocina. Aún puedes cancelarlo.'
  }
  if (data.status === 'pending_acceptance') {
    return 'El restaurante está confirmando tu pedido. Aún puedes cancelarlo.'
  }

  return 'Tu pedido ya está en preparación y no puede cancelarse.'
}

/**
 * La ventana de cancelación del cliente es ANTES de la confirmación del negocio
 * (DECISIONS §5). Se basa en el estado crudo, no en el bucket "recibido" (que ya
 * incluye `confirmed`), para no ofrecer cancelar un pedido ya confirmado.
 *
 * El prepago se corta antes que el efectivo, y por eso la condición no es
 * simétrica: solo en `pending_acceptance`. En ese estado el negocio aún está
 * confirmando disponibilidad y el cliente no ha abierto su billetera, así que
 * cancelar no deja dinero en el aire. En `validando` sí lo dejaría: ahí ya hay
 * una captura de Yape subida, y la devolución de un prepago la resuelve soporte,
 * no un botón (`0046`, afinado en `0169`).
 *
 * **Tiene que decir lo mismo que `cancel_customer_order`.** Si aquí se ofrece
 * más de lo que la RPC permite, el botón aparece y la cancelación falla con un
 * error; si se ofrece menos, hay clientes atrapados sin saber que podían salir.
 */
export function isCancellable(data: Tracking, ownedId: string | null): boolean {
  if (!ownedId) return false
  if (data.paymentIntent === 'prepaid') return data.status === 'pending_acceptance'
  return data.status === 'validando' || data.status === 'pending_acceptance'
}
