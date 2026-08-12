/**
 * Decisores de presentación visual para las tarjetas del Dashboard de Negocios (Vista Cajera).
 * Función pura desacoplada del JSX, con 100% de testabilidad en Vitest.
 */

import {
  formatReadyDelta,
  type OrderVM,
  type UiPayment,
  type UiSource,
  type UiState,
} from './view-model'

export type CardTone = 'neutral' | 'warning' | 'danger' | 'brand'

export interface SourceBadge {
  label: 'Manual' | 'Online'
  icon: string
  className: string
}

export interface StateBadge {
  label: string
  icon: string
  className: string
}

export interface CardClock {
  text: string
  tone: CardTone
  readyBadge?: boolean
  label?: string
}

export interface MoneyInfo {
  totalHeadline: string
  paymentLabel: string
  paymentClassName: string
  cashChangeText: string | null
}

export type ActionType = 'accept' | 'validate' | 'ready' | 'callDriver' | 'deliver'

export interface CardPrimaryAction {
  type: ActionType
  label: string
  isUrgent: boolean
  phoneToCall?: string
}

export interface NegociosCardVM {
  rowId: string
  shortId: string
  /** `null` cuando el origen es el normal del negocio. Ver `buildNegociosCardVM`. */
  sourceBadge: SourceBadge | null
  /** `null` en delivery, que es el caso normal. */
  methodBadge: { label: string; icon: string } | null
  stateBadge: StateBadge
  /** El nombre del cliente, o `#código` cuando no lo hay. Nunca "Cliente". */
  customerName: string
  /** `true` cuando la identidad es el código: la cejilla no lo repite. */
  identityIsCode: boolean
  customerPhone: string | null
  clock: CardClock | null
  reference: string | null
  money: MoneyInfo
  riskLabel: string | null
  primaryAction: CardPrimaryAction | null
  tone: CardTone
}

// ── Mapeos de Origen (Diferenciación Manual vs Online) ─────────────────────────
export const SOURCE_BADGE_MAP: Record<UiSource, SourceBadge> = {
  manual: {
    label: 'Manual',
    icon: 'call',
    className: 'bg-amber-100 text-amber-900 border border-amber-300/60 font-bold',
  },
  web: {
    label: 'Online',
    icon: 'language',
    className: 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold',
  },
}

// ── Mapeos de Estado ─────────────────────────────────────────────────────────
export const STATE_BADGE_MAP: Record<UiState, StateBadge> = {
  pending_acceptance: {
    label: 'Por aceptar',
    icon: 'schedule',
    className: 'bg-amber-50 text-amber-800',
  },
  validando: { label: 'Validando', icon: 'shield', className: 'bg-sky-50 text-sky-800' },
  awaiting_payment: {
    label: 'Esperando pago',
    icon: 'qr_code_2',
    className: 'bg-amber-50 text-amber-800',
  },
  cooking: { label: 'En cocina', icon: 'soup_kitchen', className: 'bg-amber-50 text-amber-900' },
  buffer_p1: {
    label: 'Lista · esperando moto',
    icon: 'check_circle',
    className: 'bg-amber-100 text-amber-900 font-bold',
  },
  buffer_p2: {
    label: 'Sin motorizado',
    icon: 'warning',
    className: 'bg-orange-100 text-orange-900 font-bold',
  },
  /**
   * LA INSIGNIA DICE EL HECHO; EL BOTÓN DA LA ORDEN.
   *
   * Decía "¡Pedir moto!", o sea el MISMO imperativo que el botón rojo que hay
   * doce píxeles más abajo ("Pedir motorizado YA"): la instrucción dos veces en
   * la misma tarjeta, y el estado real —que sigue sin haber motorizado— sin
   * decirse en ninguna parte. Es la duplicación verbo/estado que `motorizados`
   * ya se quitó de encima en §24.
   *
   * Comparte texto con `buffer_p2` a propósito: el hecho es idéntico, lo que
   * cambia es la gravedad, y eso lo llevan el color, el borde de la tarjeta y
   * el "YA" del botón.
   */
  buffer_p3: {
    label: 'Sin motorizado',
    icon: 'priority_high',
    className: 'bg-red-100 text-red-900 font-bold',
  },
  heading: {
    label: 'Motorizado en camino',
    icon: 'two_wheeler',
    className: 'bg-sky-50 text-sky-800',
  },
  waiting: {
    label: 'Motorizado llegó',
    icon: 'local_shipping',
    className: 'bg-emerald-100 text-emerald-900 font-bold',
  },
  picked_up: {
    label: 'En reparto',
    icon: 'delivery_dining',
    className: 'bg-violet-50 text-violet-800',
  },
  delivered: {
    label: 'Entregado',
    icon: 'check_circle',
    className: 'bg-ink/[0.05] text-ink-muted',
  },
  cancelled: { label: 'Cancelado', icon: 'cancel', className: 'bg-red-50 text-red-700' },
}

export const PAY_CLASS_MAP: Record<UiPayment, string> = {
  pending_cash: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  pending_wallet: 'bg-violet-50 text-violet-800 border border-violet-200',
  prepaid: 'bg-sky-50 text-sky-800 border border-sky-200',
  pending_mixed: 'bg-amber-50 text-amber-800 border border-amber-200',
}

export const PAY_LABEL_MAP: Record<UiPayment, string> = {
  pending_cash: 'Efectivo',
  pending_wallet: 'Billetera',
  prepaid: 'Prepago',
  pending_mixed: 'Mixto',
}

const RISK_REASON_LABEL: Record<string, string> = {
  gps_warning_zone: 'Validar · Zona ampliada',
  same_phone_burst: 'Validar · Varios pedidos',
  nearby_address_burst: 'Validar · Direcciones cercanas',
  new_phone_high_ticket_burst: 'Validar · Patrón inusual',
  order_spike: 'Validar · Pico de pedidos',
  standard_validation_rule: 'Validar antes de cocinar',
}

function soles(n: number): string {
  return `S/ ${Number(n).toFixed(2).replace(/\.00$/, '')}`
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Función pura que transforma un OrderVM en las decisiones visuales exactas de la tarjeta de la cajera.
 */
export function buildNegociosCardVM(
  order: OrderVM,
  options?: {
    queueLeadMin?: number
    deliveryLateMin?: number
    supportPhone?: string | null
  },
): NegociosCardVM {
  const queueLeadMin = options?.queueLeadMin ?? 5
  const deliveryLateMin = options?.deliveryLateMin ?? 20
  const supportPhone = options?.supportPhone ?? null

  // 1. Origen — SOLO CUANDO ES LA EXCEPCIÓN.
  //
  // El piloto es 100% manual (la cajera contesta el teléfono), así que la
  // insignia "Manual" salía en TODAS las tarjetas: un distintivo que no
  // distingue nada, ocupando el primer sitio de la cejilla. Lo que sí hay que
  // ver de un vistazo es el pedido que entró SOLO —nadie habló con ese cliente,
  // nadie verificó nada por teléfono—, y ese se perdía entre el ruido.
  //
  // Es la misma regla que ya aplica `motorizados` (`showSourceChip`), y se
  // invierte sola el día que el canal web sea el normal.
  const sourceBadge = order.source === 'web' ? SOURCE_BADGE_MAP.web : null

  // 2. Método de entrega — SOLO CUANDO ES LA EXCEPCIÓN, por lo mismo.
  // Casi todo es delivery; el recojo en local es lo que cambia lo que la cajera
  // tiene que hacer (no llamar a nadie, avisar al cliente), y por eso avisa.
  const methodBadge =
    order.method === 'pickup' ? { label: 'Recojo en local', icon: 'storefront' } : null

  // 3. Estado Badge
  const stateBadge = STATE_BADGE_MAP[order.state] ?? STATE_BADGE_MAP.cooking

  const hasName = Boolean(order.customer?.trim())

  // 4. Urgencia — EL BORDE ESCALA IGUAL QUE EL RELOJ.
  //
  // AQUÍ VIVÍA `isUrgent`, y borrarlo fue el arreglo: nadie lo consumía, y
  // definía "urgente" con una regla DISTINTA de la del borde (metía
  // `buffer_p2` y `waiting`, que el tono pinta de marca, no de alarma). Dos
  // definiciones de urgencia en el mismo fichero, una de ellas muerta, es una
  // divergencia esperando a que alguien conecte la equivocada. La urgencia que
  // se pinta es `tone`; la de la acción vive en `primaryAction.isUrgent`.
  //
  // El retraso de cocina ya no se queda en ámbar para siempre: pasado
  // `queueLeadMin` sube a rojo, que es la escala que §23 fija y la que el reloj
  // aplica desde el principio. Que el número gritara en rojo dentro de una
  // tarjeta con el borde ámbar era el mismo hecho contado con dos gravedades
  // distintas.
  const cocinaVencida = order.readySec != null && order.readySec < 0
  const retrasoGrave = cocinaVencida && Math.abs(order.readySec as number) > queueLeadMin * 60

  const tone: CardTone =
    order.state === 'buffer_p3' ||
    (order.state === 'pending_acceptance' && order.countdownSec < 60) ||
    retrasoGrave
      ? 'danger'
      : order.state === 'buffer_p2' || order.state === 'waiting'
        ? 'brand'
        : cocinaVencida
          ? 'warning'
          : 'neutral'

  // 5. Reloj
  /** El motorizado ya está en el local: el que espera es él, no al revés. */
  const esperaEnPuerta = order.state === 'waiting'

  /**
   * ¿Está la comida hecha? Se deriva en `toOrderVM` (por la marca O por el
   * estado), no aquí: el detalle necesita el mismo hecho, y con la regla
   * duplicada las dos pantallas ya se habían contradicho sobre el mismo pedido
   * —insignia "Lista · esperando moto" contra reloj "Demorado" en rojo, visto
   * en el tablero con #DEMZDD55—.
   *
   * Importa cuál gana: "Demorado" manda a la cajera a la cocina, y en un pedido
   * cuya comida está hecha ese viaje es en balde — al que hay que llamar es al
   * motorizado.
   */
  const comidaLista = order.comidaLista

  let clock: CardClock | null = null

  if (
    order.state === 'pending_acceptance' ||
    order.state === 'validando' ||
    order.state === 'awaiting_payment'
  ) {
    const isRed = order.countdownSec < 60
    clock = {
      text: mmss(order.countdownSec),
      tone: isRed ? 'danger' : 'brand',
      label: 'Atender',
    }
  } else if (order.deliverySec != null) {
    // En reparto el reloj cuenta HACIA ARRIBA desde la recogida, y se pone rojo
    // pasados `deliveryLateMinutes` — el mismo umbral y la misma fuente
    // (`app_settings.timers`) que usa `motorizados`, para que las dos pantallas
    // no discrepen sobre qué es un reparto tardío.
    clock = {
      text: formatReadyDelta(order.deliverySec),
      tone: order.deliverySec > deliveryLateMin * 60 ? 'danger' : 'neutral',
      label: 'En reparto',
    }
  } else if (order.readySec != null) {
    if (order.readySec < 0) {
      const elapsedSec = Math.abs(order.readySec)
      const isAmber = elapsedSec <= queueLeadMin * 60
      clock = {
        // EL SIGNO SOLO CUANDO SIGNIFICA ALGO.
        //
        // Con la comida LISTA el número ya no es un déficit contra la ETA: es
        // cuánto lleva esperando en el mostrador, y eso se cuenta hacia arriba.
        // Pintaba `✓ -06:32`, un visto de "todo bien" pegado a un menos de
        // "vas mal", y el menos además invitaba a leerlo como "faltan 6".
        // En cocina sí queda: ahí el menos es el retraso contra la promesa.
        text: formatReadyDelta(comidaLista ? elapsedSec : order.readySec),
        tone: isAmber ? 'warning' : 'danger',
        readyBadge: comidaLista,
        // §23: el copy separa de quién es la pelota. Con la comida ya declarada
        // lista, el retraso no es de la cocina sino del reparto, y decirle
        // "Demorado" a la cajera la manda a apurar a un cocinero que ya terminó.
        //
        // Y con el motorizado YA en la puerta no se puede decir "esperando
        // moto": la tarjeta enseñaba a la vez la insignia "Motorizado llegó", el
        // botón "…llegó · Entregar" y un reloj que decía que se le esperaba.
        // Quien espera ahí es él.
        label: esperaEnPuerta
          ? 'Moto esperando'
          : comidaLista
            ? 'Lista · esperando moto'
            : 'Demorado',
      }
    } else {
      clock = {
        // `formatReadyDelta` y no `Xm`: en mm:ss se ve correr el segundero, que
        // es lo que distingue un contador vivo de un número escrito. Y unifica
        // el formato con `motorizados`, que §23 pedía expresamente.
        text: formatReadyDelta(order.readySec),
        tone: 'neutral',
        readyBadge: comidaLista,
        label: esperaEnPuerta
          ? 'Moto esperando'
          : comidaLista
            ? 'Lista · esperando moto'
            : 'En cocina',
      }
    }
  } else if (order.minutesLeft != null) {
    clock = {
      text: `${order.minutesLeft}m`,
      tone: 'neutral',
      readyBadge: order.readyEarly,
      label: 'Cocina',
    }
  }

  // 6. Cobro y Vuelto
  let cashChangeText: string | null = null
  if (order.cashChange != null && order.cashChange > 0) {
    cashChangeText = `Vuelto a entregar: ${soles(order.cashChange)}`
  }

  const money: MoneyInfo = {
    totalHeadline: soles(order.total),
    paymentLabel: PAY_LABEL_MAP[order.payment] ?? 'Efectivo',
    paymentClassName: PAY_CLASS_MAP[order.payment] ?? PAY_CLASS_MAP.pending_cash,
    cashChangeText,
  }

  // 7. Riesgo
  const riskLabel = order.requiresValidation
    ? (RISK_REASON_LABEL[order.validationReasonCode ?? ''] ?? 'Validar antes de cocinar')
    : null

  // 8. Acción 1-Tap
  let primaryAction: CardPrimaryAction | null = null

  if (order.state === 'waiting') {
    primaryAction = {
      type: 'deliver',
      label: `${order.driver?.name ?? 'Motorizado'} llegó · Entregar`,
      isUrgent: true,
    }
  } else if (order.state === 'buffer_p2' || order.state === 'buffer_p3') {
    const alarma = order.state === 'buffer_p3'
    primaryAction = {
      type: 'callDriver',
      label: alarma ? 'Pedir motorizado YA' : 'Pedir motorizado',
      isUrgent: true,
      phoneToCall: supportPhone ?? undefined,
    }
  }

  return {
    rowId: order.rowId,
    shortId: order.id,
    sourceBadge,
    methodBadge,
    stateBadge,
    /**
     * LA IDENTIDAD ES EL NOMBRE, Y SI NO HAY NOMBRE ES EL CÓDIGO.
     *
     * Ponía la palabra "Cliente" en el hueco del nombre, así que en un tablero
     * con diez pedidos las diez tarjetas se llamaban igual y el renglón más
     * grande y más negro de todos no distinguía ninguna: para saber cuál era
     * cuál había que bajar a leer el `#código` en gris de 11px. Y el nombre
     * falta a menudo — el canal manual lo declara opcional
     * (`create_business_manual_order`, 0032).
     *
     * Con el código arriba, la identidad siempre identifica. `motorizados`
     * resuelve esto igual, y también quita el código de la cejilla para no
     * decirlo dos veces en la misma tarjeta.
     */
    customerName: hasName ? (order.customer as string).trim() : `#${order.id}`,
    identityIsCode: !hasName,
    customerPhone: order.phone,
    clock,
    reference: order.method === 'pickup' ? 'Recojo en local' : order.addressRef,
    money,
    riskLabel,
    primaryAction,
    tone,
  }
}
