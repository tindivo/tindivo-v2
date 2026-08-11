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
 * La ranura a la altura del nombre: UN solo dato, el más urgente del momento.
 *
 * Sustituye a tres elementos que competían por decir lo mismo (el chip "Comida
 * lista", el contador y la píldora de estado). Nunca hacían falta los tres a la
 * vez: si la comida está lista el contador ya no cuenta hacia abajo, cuenta
 * cuánto lleva esperándote, y eso ES el estado.
 */
export interface Slot {
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
  /** El nombre, en grande. Es como el motorizado identifica el pedido. */
  identity: string
  /** Icono que desambigua de quién es el nombre (en Equipo es un compañero). */
  identityIcon: string | null
  reference: string | null
  slot: Slot | null
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

/** Estado de un pedido ajeno. En Equipo la ranura lleva esto y no un reloj:
 *  `estimated_ready_at` no viaja de un pedido de otro, por diseño. */
const TEAM_STATE: Record<string, Slot> = {
  heading_to_restaurant: { icon: 'directions_bike', text: 'Va al local', tone: 'neutral' },
  waiting_at_restaurant: { icon: 'hourglass_top', text: 'En el local', tone: 'warning' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'neutral' },
}

/**
 * Qué va en la ranura, por orden de urgencia decreciente.
 *
 * El orden importa: se devuelve la PRIMERA verdad que aplica, no la suma de
 * todas. Es lo que permite que una sola ranura sustituya a tres elementos.
 */
function buildSlot(input: CardVMInput): Slot | null {
  const { order, now, variant, queueLeadMinutes } = input

  if (variant === 'delivered') {
    return order.delivered_at
      ? { icon: 'check_circle', text: `Entregado ${hourOf(order.delivered_at)}`, tone: 'neutral' }
      : null
  }

  if (variant === 'team') return TEAM_STATE[order.status] ?? null

  // Con la comida encima el reloj de cocina ya no dice nada.
  if (order.status === 'picked_up') return null

  const readyAt = order.estimated_ready_at
  if (readyAt == null) return null

  const remainingMs = Date.parse(readyAt) - now
  const readyEarly = Boolean(order.ready_early_used)

  if (remainingMs >= 0) {
    // La cajera ya marcó la comida lista y el reloj recortado (§23) aún corre:
    // contar hacia una estimación que ya se cumplió no informa. Lo que importa
    // es que está lista.
    if (readyEarly) return { icon: 'check_circle', text: 'Lista', tone: 'success' }
    return { icon: 'schedule', text: mmss(remainingMs / 1000), tone: 'neutral' }
  }

  const elapsedSec = Math.abs(remainingMs) / 1000

  // Comida lista y sin recoger: la demora es del reparto, no de la cocina, y el
  // copy se lo dice a quien puede arreglarlo (§23).
  if (readyEarly) {
    const escalated = elapsedSec > queueLeadMinutes * 60
    return {
      icon: escalated ? 'priority_high' : 'schedule',
      text: `Te espera ${mmss(elapsedSec)}`,
      tone: escalated ? 'danger' : 'warning',
    }
  }

  // La cocina se pasó de su propia estimación.
  return { icon: 'priority_high', text: `Esperando ${mmss(elapsedSec)}`, tone: 'danger' }
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
 *     vencido" y la tarjeta señalada seguía con el borde neutro.
 *
 * `orderUrgency` NO se aplica a "Míos": mira si la ETA ya pasó, y con el pedido
 * recogido eso es cierto siempre. Ahí manda el tono de la ranura.
 */
function buildTone(input: CardVMInput, slot: Slot | null): Tone {
  const { order, now, variant } = input

  if (variant === 'delivered' || variant === 'team') return 'neutral'
  if (variant === 'available' && orderUrgency(order, now) === 'overdue') return 'danger'

  return slot?.tone ?? 'neutral'
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
    const label =
      order.cash_amount != null && order.yape_amount != null
        ? `${soles(order.cash_amount)} efectivo + ${soles(order.yape_amount)} Yape`
        : 'mixto'
    return {
      icon: PAYMENT_ICON.pending_mixed ?? 'call_split',
      amount: soles(total),
      label,
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

  const slot = buildSlot(input)
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
    identity,
    identityIcon: isTeam ? 'directions_bike' : null,
    reference: order.delivery_reference ?? order.delivery_address,
    slot,
    action: variant === 'mine' ? (ACTION_VERB[order.status] ?? null) : null,
    money: blocked && blockedReason ? null : buildMoney(input),
    blockedReason: blocked && blockedReason ? blockedReason : null,
    tone: buildTone(input, slot),
    interactive: !blocked && !isTeam,
    muted: Boolean(blocked),
    showSourceChip: order.source === 'customer_pwa',
  }
}
