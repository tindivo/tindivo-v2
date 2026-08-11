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

// `orderUrgency` ya no se llama desde aquí: el tono lo decide el reloj, y el
// reloj se pasa de cero exactamente cuando esa función dice `overdue`. La
// equivalencia no se deja al azar — hay un test que la amarra.
import { hourOf, mmss, soles } from '../format'
import { changeDue } from '../payment'
import type { CardOrder } from '../types'

export type CardVariant = 'available' | 'mine' | 'delivered' | 'team'

/** Tono semántico. El componente lo traduce a clases; aquí no hay CSS. */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger'

/**
 * LA INSIGNIA ES EL ESTADO DEL PEDIDO. EL RELOJ ES EL TIEMPO. NADA MÁS.
 *
 * Antes la insignia llevaba estados DERIVADOS DEL RELOJ ("Te espera",
 * "Demorado") y había además una fila con el verbo de la acción ("Recoger
 * pedido", "Ir al local"). Eran dos estados conviviendo y diciendo lo mismo por
 * dos vías: "En el local" y "Recoger pedido" son la misma frase. Y encima el
 * estado real del pedido —lo que de verdad distingue una tarjeta de otra en una
 * bandeja donde conviven varios— no se veía por ninguna parte.
 *
 * Ahora:
 *   - LA INSIGNIA (cejilla) dice el ESTADO DEL PEDIDO, y solo eso.
 *   - EL RELOJ (altura del nombre) dice el tiempo, y solo eso.
 *   - EL VERBO SE FUE. Era la traducción del estado a imperativo; con el estado
 *     a la vista, sobraba.
 *
 * DÓNDE VA "LISTA", QUE ES EL CASO QUE NO ES OBVIO.
 *
 * `advance_order('ready')` (0128:156-159) hace DOS cosas distintas según haya
 * motorizado o no:
 *   - SIN motorizado ("En espera"): el status pasa a `waiting_driver`. O sea,
 *     el estado del pedido YA dice que está lista, y la insignia la enseña.
 *   - CON motorizado ("Míos"): el status NO cambia —sigue siendo el viaje del
 *     motorizado (`heading_to_restaurant`…)—, y lo único que marca la comida
 *     lista es `ready_early_used`. Ahí "Lista" no cabe en la insignia sin pisar
 *     el estado.
 *
 * Por eso en "Míos" la marca de comida lista viaja CON EL RELOJ (`ready`): es
 * el reloj de la comida, así que su visto bueno pertenece ahí. Un pedido puede
 * ser tuyo, ir de camino al local y estar la comida lista: insignia "Voy al
 * local", reloj "✓ 04:52". Los dos hechos, sin taparse — que es lo que exige
 * `DECISIONS §23`.
 *
 * Y soltarlo encaja solo: `release` (0121:205-210) devuelve el pedido a
 * `preparing` o a `waiting_driver` según la comida esté o no, así que al volver
 * a "En espera" la insignia dice la verdad sin ningún caso especial.
 */
export interface Clock {
  text: string
  tone: Tone
  /** Comida lista cuando el ESTADO no puede decirlo (o sea, en "Míos"). */
  ready: boolean
}

/**
 * El color del estado es CATEGÓRICO, no semántico. Nombra la FASE, no la
 * gravedad.
 *
 * Y por eso es un tipo aparte de `Tone`: en esta tarjeta el ámbar y el rojo son
 * el idioma del reloj —"se te está pasando", "ya se pasó"—, y son los únicos
 * dos colores que significan urgencia. Si un estado normal usara cualquiera de
 * los dos, una fase corriente sería indistinguible de una alarma, y el color
 * dejaría de querer decir nada. Un estado nunca es una alarma: es un hecho.
 *
 * Los nombres son de fase a propósito (`transit`, `onsite`, `carrying`), no de
 * color: el view-model no sabe de CSS y la gama se puede reafinar en el
 * componente sin tocar esto.
 */
export type StateTone = 'idle' | 'ready' | 'transit' | 'onsite' | 'carrying' | 'done'

export interface Badge {
  icon: string
  text: string
  tone: StateTone
}

/**
 * El estado del pedido, tal cual, por `status`.
 *
 * La gama sigue el viaje: gris mientras no hay nada que hacer, verde cuando
 * toca ir, azul de camino, naranja al llegar al mostrador, violeta con la
 * comida encima, gris otra vez al cerrar.
 *
 * Equipo habla en TERCERA persona porque el nombre de la tarjeta es el del
 * compañero, no el del cliente.
 */
const ORDER_STATE: Record<string, Badge> = {
  preparing: { icon: 'restaurant', text: 'En cocina', tone: 'idle' },
  waiting_driver: { icon: 'check_circle', text: 'Lista', tone: 'ready' },
  heading_to_restaurant: { icon: 'directions_bike', text: 'Voy al local', tone: 'transit' },
  waiting_at_restaurant: { icon: 'storefront', text: 'En el local', tone: 'onsite' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'carrying' },
  delivered: { icon: 'check_circle', text: 'Entregado', tone: 'done' },
}

const TEAM_STATE: Record<string, Badge> = {
  heading_to_restaurant: { icon: 'directions_bike', text: 'Va al local', tone: 'transit' },
  waiting_at_restaurant: { icon: 'storefront', text: 'En el local', tone: 'onsite' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'carrying' },
}

/**
 * EL COBRO EN DOS ALTURAS: la cifra grande, y debajo lo que hay que saber de
 * ella.
 *
 * Antes era una sola línea con icono, cifra y cualificador al mismo nivel, y el
 * importe —lo que se lee en la puerta del cliente, con prisa y con casco— no
 * pesaba más que la palabra "efectivo" que lo acompaña. Partirlo en dos alturas
 * le da a cada cosa su papel: el número se ve de lejos, el detalle se lee
 * cuando hace falta.
 *
 * SIN ICONO a propósito: la palabra ya dice el método, y el icono le robaba
 * ancho a la única línea que puede desbordarse (el mixto, con dos importes y el
 * vuelto).
 *
 * SIN VERBOS, también a propósito: "Cobrar en efectivo" solo se lee bien en
 * presente y la misma línea se pinta en el historial, donde ya se cobró.
 * `S/ 45.00 / efectivo` es cierto en cualquier tiempo verbal. La única
 * excepción es el prepago, donde la instrucción evita un error de plata.
 */
export interface MoneyLine {
  /**
   * Lo grande. La cifra a cobrar, o la palabra que ocupa su lugar cuando no hay
   * nada que cobrar: enseñar `S/ 45.00` al lado de "Prepagado" es una
   * invitación a cobrarlo por error, y sin número no hay error posible.
   */
  headline: string
  /** Lo pequeño debajo: método, desglose, vuelto o instrucción. */
  detail: string | null
  tone: Tone
}

export interface CardVM {
  /** Cejilla: local y código. `shortId` es `null` cuando sube a identidad. */
  businessName: string
  shortId: string | null
  /** Huecos de mochila, solo cuando ocupa más de uno. */
  slotsNote: string | null
  /** El reloj, a la altura del nombre. Ver la nota de `Clock`. */
  clock: Clock | null
  /** El nombre, en grande. Es como el motorizado identifica el pedido. */
  identity: string
  /** Icono que desambigua de quién es el nombre (en Equipo es un compañero). */
  identityIcon: string | null
  /** El estado del pedido, arriba en la cejilla. */
  badge: Badge | null
  reference: string | null
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
 * AQUÍ VIVÍA EL VERBO DE LA ACCIÓN ("Ir al local", "Recoger pedido").
 *
 * Se fue con el rediseño de la insignia. Era la traducción del estado a
 * imperativo, así que con el estado del pedido a la vista quedaban dos estados
 * conviviendo en la misma tarjeta y diciendo lo mismo por dos vías: "En el
 * local" y "Recoger pedido" son la misma frase.
 *
 * De paso desaparecieron con él dos defectos que ya no tienen dónde ocurrir: el
 * `preparing` que caía en un genérico "Ver pedido" por no estar en el mapa, y
 * el "Entregar a {compañero}" de Equipo —un imperativo dirigido a quien no
 * puede ejecutarlo, con el nombre del dueño donde el lector espera el del
 * cliente—.
 */

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

/**
 * El reloj. Siempre que haya uno, marque o no la cajera.
 *
 * MIENTRAS NO BAJE DE CERO, NO HAY ALARMA. El tono es neutro hasta que el
 * contador se pasa; recién ahí escala. Un reloj que se pone de color con seis
 * minutos por delante enseña a ignorar el color.
 */
function buildClock(input: CardVMInput): Clock | null {
  const { order, variant } = input

  if (variant === 'delivered') {
    return order.delivered_at
      ? { text: hourOf(order.delivered_at), tone: 'neutral', ready: false }
      : null
  }

  const ms = remainingMs(input)
  if (ms == null) return null

  // La marca de comida lista SOLO aquí cuando el estado no puede decirla, o sea
  // con el pedido ya tomado. Sin motorizado, `ready` deja el status en
  // `waiting_driver` y la insignia ya pone "Lista": repetirlo sería decirlo dos
  // veces en la misma tarjeta.
  const ready = variant === 'mine' && Boolean(order.ready_early_used)
  const text = mmss(Math.abs(ms) / 1000)

  if (ms >= 0) return { text, tone: 'neutral', ready }

  // Ya se pasó. Si la cajera marcó la comida lista, la demora es del reparto y
  // escala con el margen de cola; si no, es la cocina la que se pasó.
  return {
    text,
    tone: order.ready_early_used ? escalation(input, ms) : 'danger',
    ready,
  }
}

/**
 * La insignia: EL ESTADO DEL PEDIDO, tal cual viene de `status`.
 *
 * Ya no lleva estados derivados del reloj ("Te espera", "Demorado"). Esos eran
 * el tiempo disfrazado de estado, y convivían con el verbo de la acción
 * diciendo lo mismo por otra vía. Lo que distingue de verdad una tarjeta de
 * otra en una bandeja donde conviven varias fases es el estado del pedido, y
 * eso es lo que se pinta aquí. La demora la sigue contando el reloj, con su
 * color, abajo.
 */
function buildBadge(input: CardVMInput): Badge | null {
  const { order, variant } = input

  if (variant === 'team') return TEAM_STATE[order.status] ?? null
  if (variant === 'delivered' && order.delivered_at == null) return null

  return ORDER_STATE[order.status] ?? null
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
 *   - "En espera" queda alineada con `orderUrgency`, LA MISMA función con la que
 *     la bandeja ordena, bloquea las demás tarjetas y dispara el banner. Antes
 *     la tarjeta tenía su propio criterio (más estricto), así que el cartel
 *     gritaba y la tarjeta señalada se quedaba con el borde neutro. Hoy las dos
 *     preguntan lo mismo —¿pasó el reloj de la cocina?— y hay un test que lo
 *     amarra.
 *
 * EL BORDE LO MANDA EL RELOJ, Y SOLO POR DEBAJO DE CERO. Ya no lo mueve la
 * insignia: la insignia es el ESTADO del pedido, y un estado es un hecho, no
 * una alarma. Un pedido "En cocina" con seis minutos por delante no tiene por
 * qué teñir nada; el día que el contador se pase, el borde se enciende solo.
 */
function buildTone(input: CardVMInput, clock: Clock | null): Tone {
  const { variant } = input

  if (variant === 'delivered' || variant === 'team') return 'neutral'

  return clock?.tone ?? 'neutral'
}

/**
 * La línea de cobro.
 *
 * EL VUELTO APARECE SIEMPRE QUE EXISTA, también en "En espera": si no llevas
 * sencillo encima, un pedido que paga con billete grande es un problema que
 * prefieres ver antes de aceptarlo y no en la puerta del cliente. En el
 * historial no se pinta: ahí ya se dio.
 */
function buildMoney(input: CardVMInput): MoneyLine | null {
  const { order, variant } = input
  const total = order.order_amount + order.delivery_fee
  const intent = order.payment_intent

  // De un pedido ajeno el cobro no viaja. Solo el importe, para decidir si
  // pides el traspaso.
  if (variant === 'team') {
    return { headline: soles(total), detail: 'importe del pedido', tone: 'neutral' }
  }

  // LA PALABRA OCUPA EL SITIO DE LA CIFRA. Sin número no hay número que cobrar
  // por error, y la instrucción va debajo donde va el método en los demás: el
  // bloque se lee igual en los cuatro casos.
  if (intent === 'prepaid') {
    return { headline: 'Prepagado', detail: 'no cobrar', tone: 'success' }
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

  const change = vuelto != null && vuelto > 0 ? ` · vuelto ${soles(vuelto)}` : ''

  if (intent === 'pending_mixed') {
    // El desglose EXISTE en la base desde 0002 y `negocios` ya lo lee; al board
    // del motorizado no llegaba, así que el caso que más necesita el detalle
    // era el único que no podía darlo.
    //
    // LA CIFRA GRANDE ES LA PARTE EN EFECTIVO, NO EL TOTAL. En un pago mixto el
    // total no es un número que el motorizado maneje: no cuenta 45, cuenta 30 y
    // comprueba que entraron 15 por Yape. Enseñar además el total ponía tres
    // importes seguidos con el primero redundante, porque las dos partes ya
    // suman.
    if (order.cash_amount != null && order.yape_amount != null) {
      return {
        headline: soles(order.cash_amount),
        detail: `efectivo + ${soles(order.yape_amount)} Yape${change}`,
        tone: 'neutral',
      }
    }

    // Sin desglose no se inventa: se enseña el total y se nombra el método.
    return { headline: soles(total), detail: `mixto${change}`, tone: 'neutral' }
  }

  if (intent === 'pending_yape') {
    return { headline: soles(total), detail: `Yape/Plin${change}`, tone: 'neutral' }
  }

  if (intent === 'pending_cash') {
    return { headline: soles(total), detail: `efectivo${change}`, tone: 'neutral' }
  }

  // NI NULL NI DESCONOCIDO SE HACEN PASAR POR EFECTIVO. El tipo admite `null` y
  // la rama final del código anterior afirmaba "Cobrar en efectivo" para
  // cualquier valor que no reconociera: un dato ausente convertido en una
  // instrucción de cobro.
  return { headline: soles(total), detail: `método por confirmar${change}`, tone: 'neutral' }
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
    money: blocked && blockedReason ? null : buildMoney(input),
    blockedReason: blocked && blockedReason ? blockedReason : null,
    tone: buildTone(input, clock),
    interactive: !blocked && !isTeam,
    muted: Boolean(blocked),
    showSourceChip: order.source === 'customer_pwa',
  }
}
