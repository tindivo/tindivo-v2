/**
 * Decisiones de presentación de la tarjeta del board, en una función pura.
 *
 * POR QUÉ EXISTE.
 * `OrderCard` tenía las cuatro variantes, los cuatro métodos de cobro y los
 * cuatro estados de urgencia incrustados en el JSX, y `apps/motorizados` no
 * tenía un solo test. Cada combinación solo se podía verificar abriendo la app
 * y mirando — que es exactamente como se colaron los defectos que esta
 * refactorización arregla (el historial en rojo, el `preparing` sin verbo, el
 * imperativo dirigido al compañero equivocado).
 *
 * `apps/negocios` ya había elegido este patrón en `lib/orders/view-model.ts`.
 * Aquí se replica: esta función decide QUÉ se dice, el componente solo pinta.
 *
 * Importa por ruta relativa a propósito: así los tests corren con vitest sin
 * configuración de alias, igual que los de negocios.
 */

import { hourOf, mmss, soles } from '../format'
import { changeDue } from '../payment'
import type { CardOrder } from '../types'
import { orderUrgency } from '../urgency'

export type CardVariant = 'available' | 'mine' | 'delivered' | 'team'

/** Tono semántico. El componente lo traduce a clases; aquí no hay CSS. */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger'

/**
 * EL RELOJ Y EL ESTADO SON DOS COSAS, Y VAN EN DOS SITIOS.
 *
 * Hubo un intento de fundirlos en una sola ranura "con la verdad más urgente".
 * Estaba mal, y `DECISIONS §23` ya lo decía por escrito: `ready_early_used`
 * **no debe usarse como guarda para ocultar el temporizador**, y el legacy
 * enseñaba "Comida lista" y el reloj a la vez. Fundirlos volvía a esconder el
 * contador justo al marcar la comida lista — la misma regresión que §23 había
 * arreglado.
 *
 * Ahora, y con EL NÚMERO ABAJO Y LA PALABRA ARRIBA:
 *   - LA INSIGNIA vive arriba, en la cejilla. Pequeña, con su color. Solo
 *     aparece cuando hay algo que decir con palabras ("Lista", "Te espera",
 *     "Demorado", "Sin tomar", o el estado del compañero en Equipo).
 *   - EL RELOJ vive a la altura del nombre, que es donde cae la vista. Es el
 *     dato que decide si te da tiempo, así que se lleva el peso: mono grande,
 *     `tabular-nums`, con el color de la urgencia. Sin caja — el color y el
 *     tamaño ya lo destacan, y una píldora ahí competía con el nombre.
 *
 * Así conviven, cada uno en su fila, y ninguno tapa al otro.
 */
export interface Clock {
  text: string
  tone: Tone
}

export interface Badge {
  icon: string
  text: string
  tone: Tone
}

/**
 * La línea de cobro. Una sola, método al frente, sin verbos.
 *
 * SIN VERBOS a propósito: "Cobrar en efectivo" solo se lee bien en presente y
 * la misma línea se pinta en el historial, donde ya se cobró. `S/ 45.00 ·
 * efectivo` es cierto en cualquier tiempo verbal. La única excepción es el
 * prepago, donde la instrucción evita un error de plata.
 */
export interface MoneyLine {
  icon: string
  /** `null` en prepago: enseñar la cifra invita a cobrarla por error. */
  amount: string | null
  label: string
  /** `vuelto S/ 5.00`, o `null` si no hay o si ya no viene a cuento. */
  change: string | null
  tone: Tone
}

export interface CardVM {
  /** Cejilla: local y código. `shortId` es `null` cuando sube a identidad. */
  businessName: string
  shortId: string | null
  /** Huecos de mochila, solo cuando ocupa más de uno. */
  slotsNote: string | null
  /** El reloj, en la esquina. Ver la nota de `Clock`. */
  clock: Clock | null
  /** El nombre, en grande. Es como el motorizado identifica el pedido. */
  identity: string
  /** Icono que desambigua de quién es el nombre (en Equipo es un compañero). */
  identityIcon: string | null
  /** La insignia de estado, a la altura del nombre. */
  badge: Badge | null
  reference: string | null
  /** Verbo de la acción siguiente. Solo en "Míos". */
  action: string | null
  money: MoneyLine | null
  /** Motivo del bloqueo. Ocupa el sitio del dinero: si no lo puedes tomar, el
   *  precio no decide nada. */
  blockedReason: string | null
  tone: Tone
  interactive: boolean
  muted: boolean
  showSourceChip: boolean
}

export interface CardVMInput {
  order: CardOrder
  now: number
  variant: CardVariant
  queueLeadMinutes: number
  /** Nombre del compañero dueño del pedido. Solo en Equipo. */
  ownerName?: string
  blocked?: boolean
  blockedReason?: string
}

/**
 * Verbo de la acción siguiente, SOLO para "Míos".
 *
 * Las otras tres bandejas no lo llevan, y eso resuelve dos defectos de raíz en
 * vez de parchearlos:
 *   - En "En espera" un pedido `preparing` dentro de la ventana de cola caía al
 *     genérico "Ver pedido", porque el mapa no tenía esa clave. Ya no hay mapa
 *     que consultar ahí.
 *   - En Equipo se pintaba "Entregar a {compañero}": un imperativo dirigido a
 *     quien no puede ejecutarlo, y con el nombre del dueño en el sitio donde el
 *     lector espera el del cliente.
 *
 * `picked_up` ya NO lleva el nombre del cliente ("Entregar a María"): el nombre
 * vive fijo en la identidad de la tarjeta, así que repetirlo aquí era la misma
 * palabra dos veces en la misma tarjeta.
 */
const ACTION_VERB: Record<string, string> = {
  heading_to_restaurant: 'Ir al local',
  waiting_at_restaurant: 'Recoger pedido',
  picked_up: 'Entregar pedido',
}

/** Estado de un pedido ajeno. En Equipo no hay reloj que enseñar:
 *  `estimated_ready_at` no viaja de un pedido de otro, por diseño. */
const TEAM_STATE: Record<string, Badge> = {
  heading_to_restaurant: { icon: 'directions_bike', text: 'Va al local', tone: 'neutral' },
  waiting_at_restaurant: { icon: 'hourglass_top', text: 'En el local', tone: 'warning' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'neutral' },
}

/** Milisegundos que faltan (negativo = ya pasó), o `null` si no hay reloj. */
function remainingMs(input: CardVMInput): number | null {
  const { order, now, variant } = input
  if (variant === 'team' || variant === 'delivered') return null
  // Con la comida encima el reloj de cocina ya no dice nada.
  if (order.status === 'picked_up') return null
  if (order.estimated_ready_at == null) return null
  return Date.parse(order.estimated_ready_at) - now
}

/**
 * Cuánto se ha pasado del margen de cola, o `null` si no se ha pasado.
 *
 * El umbral sale de `app_settings.timers.queueLeadMinutes` (§23), nunca del
 * código.
 */
function escalation(input: CardVMInput, ms: number): 'warning' | 'danger' {
  const elapsedSec = Math.abs(ms) / 1000
  return elapsedSec > input.queueLeadMinutes * 60 ? 'danger' : 'warning'
}

/** El reloj de la esquina. Siempre que haya uno, marque o no la cajera. */
function buildClock(input: CardVMInput): Clock | null {
  if (input.variant === 'delivered') {
    return input.order.delivered_at
      ? { text: hourOf(input.order.delivered_at), tone: 'neutral' }
      : null
  }

  const ms = remainingMs(input)
  if (ms == null) return null

  const text = mmss(Math.abs(ms) / 1000)
  if (ms >= 0) return { text, tone: 'neutral' }

  // Ya se pasó. Si la cajera marcó la comida lista, la demora es del reparto y
  // escala con el margen de cola; si no, es la cocina la que se pasó.
  return {
    text,
    tone: input.order.ready_early_used ? escalation(input, ms) : 'danger',
  }
}

/**
 * La insignia de estado, arriba en la cejilla. Solo cuando hay algo que decir
 * con palabras; el número lo lleva el reloj, abajo.
 */
function buildBadge(input: CardVMInput): Badge | null {
  const { order, variant } = input

  if (variant === 'delivered') {
    return order.delivered_at ? { icon: 'check_circle', text: 'Entregado', tone: 'neutral' } : null
  }

  if (variant === 'team') return TEAM_STATE[order.status] ?? null

  const ms = remainingMs(input)
  const readyEarly = Boolean(order.ready_early_used)

  // COMIDA LISTA Y RELOJ VIVO: van LOS DOS, cada uno en su fila. Esconder el
  // contador al marcar listo es justamente lo que §23 prohíbe.
  if (ms != null && ms >= 0 && readyEarly) {
    return { icon: 'check_circle', text: 'Lista', tone: 'success' }
  }

  if (ms != null && ms < 0) {
    // Lista y sin recoger: el copy se lo dice a quien puede arreglarlo (§23).
    if (readyEarly) {
      const tone = escalation(input, ms)
      return { icon: tone === 'danger' ? 'priority_high' : 'schedule', text: 'Te espera', tone }
    }
    // La cocina se pasó de su propia estimación.
    return { icon: 'priority_high', text: 'Demorado', tone: 'danger' }
  }

  // NADIE LO HA TOMADO, Y LA COCINA VA BIEN.
  //
  // `urgent_since` lo sella el cron `OrderOverdue` (0134) cuando el pedido pasa
  // `assignment_rules.urgentAfterMinutes` sin dueño — un reloj distinto del de
  // la cocina, que puede dispararse con la comida todavía en el horno. Sin esta
  // rama la tarjeta salía con el borde rojo, el contador contando tan tranquilo
  // y NADA que explicara el rojo.
  //
  // Va la última a propósito: si hay algo que decir de la comida, eso manda.
  if (variant === 'available' && order.urgent_since) {
    return { icon: 'hourglass_top', text: 'Sin tomar', tone: 'danger' }
  }

  return null
}

/**
 * El tono del hairline de la tarjeta.
 *
 * SE RESTAURA LA DOCTRINA ORIGINAL: la urgencia mueve el borde, nunca el
 * relleno. El rediseño de §24 había metido fondos semánticos
 * (`bg-danger-soft/10`, `bg-amber-50/20`, `bg-success/[0.02]`) mientras el
 * docblock de `urgency.ts` seguía argumentando en contra, y con razón: el
 * relleno aplana el contraste de todo lo que hay dentro justo en la tarjeta que
 * más urge leer. Uno de esos fondos era además del 2% de opacidad, o sea
 * invisible en un móvil al sol.
 *
 * DOS ARREGLOS MÁS, por construcción y no por parche:
 *
 *   - "Entregado" NUNCA se colorea. La tarjeta calculaba el borde sin mirar la
 *     variante, así que un pedido de hace tres horas tenía la ETA vencida por
 *     goleada y el historial entero salía en rojo de alarma.
 *
 *   - "En espera" usa `orderUrgency`, LA MISMA función con la que la bandeja
 *     ordena, bloquea las demás tarjetas y dispara el banner. Antes la tarjeta
 *     tenía su propio criterio (más estricto), así que el cartel gritaba "hay un
 *     vencido" y la tarjeta señalada se quedaba con el borde neutro.
 *
 * `orderUrgency` NO se aplica a "Míos": mira si la ETA ya pasó, y con el pedido
 * recogido eso es cierto siempre.
 */
function buildTone(input: CardVMInput, badge: Badge | null, clock: Clock | null): Tone {
  const { order, now, variant } = input

  if (variant === 'delivered' || variant === 'team') return 'neutral'
  if (variant === 'available' && orderUrgency(order, now) === 'overdue') return 'danger'

  return badge?.tone ?? clock?.tone ?? 'neutral'
}

const PAYMENT_ICON: Record<string, string> = {
  prepaid: 'verified',
  pending_cash: 'payments',
  pending_yape: 'qr_code_2',
  pending_mixed: 'call_split',
}

/**
 * La línea de cobro.
 *
 * EL VUELTO APARECE SIEMPRE QUE EXISTA, también en "En espera": si no llevas
 * sencillo encima, un pedido que paga con billete grande es un problema que
 * prefieres ver antes de aceptarlo y no en la puerta del cliente. En el
 * historial no se pinta: ahí ya se dio.
 *
 * EL PREPAGO NO LLEVA CIFRA. Poner `S/ 45.00` al lado de "Prepagado" es una
 * invitación a cobrarlo por error; sin número no hay error posible.
 */
function buildMoney(input: CardVMInput): MoneyLine | null {
  const { order, variant } = input
  const total = order.order_amount + order.delivery_fee
  const intent = order.payment_intent

  // De un pedido ajeno el cobro no viaja. Solo el importe, para decidir si
  // pides el traspaso.
  if (variant === 'team') {
    return {
      icon: 'receipt_long',
      amount: soles(total),
      label: 'importe',
      change: null,
      tone: 'neutral',
    }
  }

  if (intent === 'prepaid') {
    return {
      icon: PAYMENT_ICON.prepaid ?? 'verified',
      amount: null,
      label: 'Prepagado · no cobrar',
      change: null,
      tone: 'success',
    }
  }

  const vuelto =
    variant === 'delivered'
      ? null
      : changeDue({
          paymentIntent: intent,
          total,
          cashAmount: order.cash_amount,
          clientPaysWith: order.client_pays_with,
          changeToGive: order.change_to_give,
        })

  const change = vuelto != null && vuelto > 0 ? `vuelto ${soles(vuelto)}` : null

  if (intent === 'pending_mixed') {
    // El desglose EXISTE en la base desde 0002 y `negocios` ya lo lee; al board
    // del motorizado no llegaba, así que el caso que más necesita el detalle
    // era el único que no podía darlo.
    //
    // LA CIFRA GRANDE ES LA PARTE EN EFECTIVO, NO EL TOTAL. En un pago mixto el
    // total no es un número que el motorizado maneje: no cuenta 45, cuenta 30 y
    // comprueba que entraron 15 por Yape. Enseñar además el total ponía tres
    // importes seguidos en la misma línea —`S/ 45.00 S/ 30.00 efectivo + S/
    // 15.00 Yape`— con el primero redundante, porque las dos partes ya suman.
    if (order.cash_amount != null && order.yape_amount != null) {
      return {
        icon: PAYMENT_ICON.pending_mixed ?? 'call_split',
        amount: soles(order.cash_amount),
        label: `efectivo + ${soles(order.yape_amount)} Yape`,
        change,
        tone: 'neutral',
      }
    }

    // Sin desglose no se inventa: se enseña el total y se nombra el método.
    return {
      icon: PAYMENT_ICON.pending_mixed ?? 'call_split',
      amount: soles(total),
      label: 'mixto',
      change,
      tone: 'neutral',
    }
  }

  if (intent === 'pending_yape') {
    return {
      icon: PAYMENT_ICON.pending_yape ?? 'qr_code_2',
      amount: soles(total),
      label: 'Yape/Plin',
      change,
      tone: 'neutral',
    }
  }

  if (intent === 'pending_cash') {
    return {
      icon: PAYMENT_ICON.pending_cash ?? 'payments',
      amount: soles(total),
      label: 'efectivo',
      change,
      tone: 'neutral',
    }
  }

  // NI NULL NI DESCONOCIDO SE HACEN PASAR POR EFECTIVO. El tipo admite `null` y
  // la rama final del código anterior afirmaba "Cobrar en efectivo" para
  // cualquier valor que no reconociera: un dato ausente convertido en una
  // instrucción de cobro.
  return {
    icon: 'help',
    amount: soles(total),
    label: 'método por confirmar',
    change,
    tone: 'neutral',
  }
}

export function buildCardVM(input: CardVMInput): CardVM {
  const { order, variant, ownerName, blocked, blockedReason } = input

  const clock = buildClock(input)
  const badge = buildBadge(input)
  const isTeam = variant === 'team'

  // LA IDENTIDAD ES EL NOMBRE, y por eso tiene un plan B explícito: el canal
  // manual —el 100% del piloto— declara el nombre opcional
  // (`create_business_manual_order`, 0032), así que puede no haberlo. Cuando
  // falta, el código corto sube a identidad y desaparece de la cejilla: sirve
  // de identificador de repuesto sin salir dos veces en la misma tarjeta.
  const name = isTeam ? ownerName : order.customer_name
  const hasName = Boolean(name?.trim())
  const identity = hasName ? (name as string).trim() : `#${order.short_id}`

  return {
    businessName: order.business?.name ?? 'Restaurante',
    shortId: hasName ? order.short_id : null,
    slotsNote: isTeam && order.occupancy_slots > 1 ? `${order.occupancy_slots} huecos` : null,
    clock,
    identity,
    identityIcon: isTeam ? 'directions_bike' : null,
    badge,
    reference: order.delivery_reference ?? order.delivery_address,
    action: variant === 'mine' ? (ACTION_VERB[order.status] ?? null) : null,
    money: blocked && blockedReason ? null : buildMoney(input),
    blockedReason: blocked && blockedReason ? blockedReason : null,
    tone: buildTone(input, badge, clock),
    interactive: !blocked && !isTeam,
    muted: Boolean(blocked),
    showSourceChip: order.source === 'customer_pwa',
  }
}
