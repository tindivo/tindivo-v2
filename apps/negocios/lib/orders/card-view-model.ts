/**
 * Decisores de presentación visual para las tarjetas del Dashboard de Negocios (Vista Cajera).
 * Función pura desacoplada del JSX, con 100% de testabilidad en Vitest.
 */

import { demandsCashier } from './attention'
import {
  formatReadyDelta,
  type OrderVM,
  type UiPayment,
  type UiSource,
  type UiState,
} from './view-model'

export type CardTone = 'neutral' | 'warning' | 'danger' | 'brand'

/**
 * EL LATIDO: «OYE, ATIENDE A ESTO».
 *
 * El tono (`CardTone`) dice cómo de grave es la tarjeta; el latido dice de
 * QUIÉN es la pelota. Son cosas distintas y por eso son dos campos: un reparto
 * que se pasa de los veinte minutos es grave —y se pinta— pero la cajera no
 * puede hacer nada con él desde el mostrador, así que no la interrumpe.
 *
 * · `none`      · no le toca a ella. La tarjeta está, quieta.
 * · `attention` · le toca, y hay tiempo. Un anillo de marca que respira.
 * · `urgent`    · le toca y queda menos de un minuto antes de que el cron lo
 *                 cancele solo. Se pone rojo y late más rápido.
 *
 * El umbral del minuto es el mismo que ya usaban el reloj y el borde, para que
 * la tarjeta no diga «rojo» en un sitio y «tranquilo» en otro.
 */
export type CardPulse = 'none' | 'attention' | 'urgent'

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

/**
 * DÓNDE VA EL PEDIDO, EN UNA O EN DOS LÍNEAS SEGÚN EL CANAL.
 *
 * El manual trae UN solo texto: la cajera escucha al cliente por teléfono y
 * escribe una línea ("renovación, casa de Lali"). El online trae DOS: la
 * dirección que el cliente eligió y, aparte, la referencia que escribió. La
 * tarjeta enseñaba solo la referencia, así que de un pedido online se perdía la
 * mitad del destino — y es justo el pedido con el que nadie ha hablado.
 *
 * `primary` es la referencia cuando la hay, no la dirección: en San Jacinto
 * "casa de Lali, portón azul" localiza la casa y "Jr. Lima 234" no
 * necesariamente. `motorizados` ordena las dos igual (`destination-card.tsx`), y
 * las dos pantallas tienen que decir lo mismo primero cuando la cajera y el
 * motorizado hablan por teléfono.
 */
export interface CardDestination {
  primary: string
  /** La dirección formal. `null` cuando ya es `primary` o cuando no existe. */
  secondary: string | null
}

/**
 * QUÉ TIENE QUE PASAR CON EL DINERO. Es la pregunta que la tarjeta contesta, y
 * no la contestaba: enseñaba el método de pago ("Prepago", "Efectivo") como si
 * el método fuera el hecho. No lo es. Para la cajera hay tres situaciones
 * distintas que la palabra "Prepago" mete en el mismo saco:
 *
 * - `paid`        · la plata YA entró y alguien la verificó. No hay nada que hacer.
 * - `unverified`  · el cliente dice que pagó y el comprobante está sin mirar.
 *                   ES TRABAJO SUYO, y es el único caso en el que la comida no
 *                   debería salir todavía.
 * - `rejected`    · lo miró y no cuadraba.
 * - `collect`     · se cobra en la puerta (o en el mostrador). Aquí lo que
 *                   importa es cuánto y con qué, más el vuelto que sale de caja.
 */
export type MoneyStatus = 'paid' | 'unverified' | 'rejected' | 'collect'

export interface MoneyInfo {
  totalHeadline: string
  /**
   * ¿Se enseña la cifra? NO cuando no hay nada que cobrar.
   *
   * Regla prestada de `motorizados` (`presentation.ts`): «enseñar `S/ 45.00` al
   * lado de "Prepagado" es una invitación a cobrarlo por error, y sin número no
   * hay error posible». Vale igual en el mostrador que en la puerta.
   *
   * El prepago SIN verificar es la excepción y sí la lleva: ahí la cifra no es
   * un cobro, es el dato contra el que la cajera compara el comprobante.
   */
  showTotal: boolean
  status: MoneyStatus
  paymentLabel: string
  paymentIcon: string
  paymentClassName: string
  /** Desglose del cobro mixto: `S/ 18 Yape/Plin + S/ 12 efectivo`. */
  breakdown: string | null
  /** `Paga con S/ 50`, o `Paga justo` cuando no hay vuelto. */
  paysWithText: string | null
  cashChangeText: string | null
}

/**
 * Las acciones que la tarjeta SABE pintar. Ni una más.
 *
 * Declaraba también `'accept'`, `'validate'` y `'ready'`, que
 * `buildNegociosCardVM` no produce nunca y que el JSX no sabe dibujar: tres
 * ramas muertas que se leían como una promesa de la tarjeta. Es el mismo tipo
 * de trampa que el `isUrgent` que se borró unas líneas más abajo —una segunda
 * definición esperando a que alguien conecte la equivocada—, con el agravante
 * de que aquí el nombre invita: quien busque «por qué no hay botón de aceptar
 * en la tarjeta» encuentra el tipo y cree que el trabajo está a medias.
 *
 * Aceptar desde la tarjeta puede acabar existiendo. El día que exista, el valor
 * se añade aquí junto con la rama que lo pinta, en el mismo cambio.
 */
export type ActionType = 'callDriver' | 'deliver'

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
  destination: CardDestination | null
  money: MoneyInfo
  riskLabel: string | null
  primaryAction: CardPrimaryAction | null
  tone: CardTone
  /** Ver `CardPulse`. Sale del mismo predicado que enciende la alarma. */
  pulse: CardPulse
}

// ── Mapeos de Origen (Diferenciación Manual vs Online) ─────────────────────────
export const SOURCE_BADGE_MAP: Record<UiSource, SourceBadge> = {
  manual: {
    label: 'Manual',
    icon: 'call',
    className: 'bg-amber-100 text-amber-900 border border-amber-300/60 font-bold',
  },
  /**
   * SÓLIDO, NO PASTEL. Era `bg-blue-50` sobre blanco: la insignia que separa el
   * pedido con el que NADIE HABLÓ de los demás pesaba visualmente menos que el
   * chip de estado que llevan todas. Si el único marcador de canal es una
   * ausencia —sin insignia = manual—, el marcador que sí está tiene que verse
   * desde el otro lado del mostrador.
   */
  web: {
    label: 'Online',
    icon: 'language',
    className: 'bg-blue-600 text-white font-bold',
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

// ── Cobro ────────────────────────────────────────────────────────────────────
//
// Los mapas de abajo cubren SOLO el caso `collect` (hay plata que cobrar en la
// puerta). El prepago no está aquí porque no es un método de cobro sino un
// estado de verificación, y se resuelve en `buildMoney`.

const COLLECT_CLASS_MAP: Record<UiPayment, string> = {
  pending_cash: 'bg-emerald-50 text-emerald-900 border border-emerald-200',
  pending_wallet: 'bg-violet-50 text-violet-900 border border-violet-200',
  pending_mixed: 'bg-amber-50 text-amber-900 border border-amber-200',
  // Inalcanzable (`prepaid` nunca es `collect`); el Record lo exige.
  prepaid: 'bg-sky-50 text-sky-900 border border-sky-200',
}

const COLLECT_LABEL_MAP: Record<UiPayment, string> = {
  pending_cash: 'Cobrar en efectivo',
  pending_wallet: 'Cobrar con Yape/Plin',
  pending_mixed: 'Cobro mixto',
  prepaid: 'Cobrar',
}

const COLLECT_ICON_MAP: Record<UiPayment, string> = {
  pending_cash: 'payments',
  pending_wallet: 'qr_code_2',
  pending_mixed: 'shuffle',
  prepaid: 'payments',
}

/**
 * El bloque de dinero de la tarjeta. Ver `MoneyStatus` para el porqué de los
 * cuatro estados.
 *
 * El prepago sin verificar es el que justifica todo esto: `payment_intent =
 * 'prepaid'` con `payment_proof_status` en `pending` significa que el cliente
 * subió una captura y NADIE la ha mirado. La tarjeta lo pintaba con la misma
 * etiqueta celeste tranquila que un prepago ya verificado —"Prepago"—, o sea
 * que el pedido que exige una comprobación y el que no exige ninguna eran
 * indistinguibles. Con el canal online ese es el caso corriente, no el raro.
 */
function buildMoney(order: OrderVM): MoneyInfo {
  const totalHeadline = soles(order.total)

  const breakdown =
    order.payment === 'pending_mixed'
      ? `${soles(order.walletPart ?? 0)} Yape/Plin + ${soles(order.cashPart ?? 0)} efectivo`
      : null

  // Vuelto y "paga con": solo donde hay efectivo de por medio.
  const hayEfectivo = order.payment === 'pending_cash' || order.payment === 'pending_mixed'
  const cashChangeText =
    hayEfectivo && order.cashChange != null && order.cashChange > 0
      ? `Vuelto a entregar: ${soles(order.cashChange)}`
      : null
  // "Paga con S/ 20" JUNTO A UN TOTAL DE S/ 30 SE LEE COMO UN ERROR, y en mixto
  // no lo es: `client_pays_with` es el billete con el que cubre SOLO la parte en
  // efectivo. El detalle ya lo dice así ("Cliente paga efectivo con"); la
  // tarjeta lo decía a secas y dejaba a la cajera cuadrando una resta que no
  // era la suya.
  const conQue = order.payment === 'pending_mixed' ? 'el efectivo con' : 'con'
  // "Paga justo" NO se afirma sin dato: sin `client_pays_with` lo que hay es
  // desconocimiento, y decirle a la cajera que no hace falta vuelto cuando nadie
  // lo preguntó es peor que callarse. Con el dato y sin vuelto, sí.
  const paysWithText =
    !hayEfectivo || order.paysWith == null
      ? null
      : cashChangeText
        ? `Paga ${conQue} ${soles(order.paysWith)}`
        : `Paga justo ${conQue} ${soles(order.paysWith)}`

  if (order.payment === 'prepaid') {
    const yaPagado = {
      totalHeadline,
      showTotal: false,
      status: 'paid' as const,
      paymentIcon: 'verified',
      paymentClassName: 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold',
      breakdown: null,
      paysWithText: null,
      cashChangeText: null,
    }

    /**
     * EN UN MANUAL NO HAY NADA QUE VERIFICAR, Y NUNCA LO VA A HABER.
     *
     * La cajera cobró ella misma —por Yape, en la mano— y DESPUÉS creó el
     * pedido: cuando la tarjeta existe, el dinero ya entró y ella es la
     * verificación. `create_business_manual_order` no escribe
     * `payment_proof_status` en ningún caso, así que un manual prepagado se
     * queda en `NULL` para siempre.
     *
     * Sin esta rama caía en "Falta verificar el pago" y le pedía revisar un
     * comprobante que no existe: trabajo inventado en la única columna donde
     * ella mira qué le falta por hacer. Visto en el piloto con #EWWLWNCV.
     *
     * El comprobante SOLO existe en el canal online, donde lo sube el cliente y
     * ella no vio el dinero entrar.
     */
    if (order.source === 'manual') {
      return { ...yaPagado, paymentLabel: 'Prepagado · no cobrar' }
    }
    if (order.proofStatus === 'rejected') {
      return {
        totalHeadline,
        showTotal: true,
        status: 'rejected',
        paymentLabel: 'Comprobante rechazado',
        paymentIcon: 'gpp_bad',
        paymentClassName: 'bg-red-100 text-red-900 border border-red-300 font-bold',
        breakdown: null,
        paysWithText: null,
        cashChangeText: null,
      }
    }
    if (order.proofStatus === 'verified') {
      return { ...yaPagado, paymentLabel: 'Pagado · no cobrar' }
    }
    return {
      totalHeadline,
      // La cifra se queda: aquí no es un cobro, es contra lo que compara.
      showTotal: true,
      status: 'unverified',
      paymentLabel: 'Falta verificar el pago',
      paymentIcon: 'hourglass_top',
      paymentClassName: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
      breakdown: null,
      paysWithText: null,
      cashChangeText: null,
    }
  }

  return {
    totalHeadline,
    showTotal: true,
    status: 'collect',
    paymentLabel: COLLECT_LABEL_MAP[order.payment] ?? COLLECT_LABEL_MAP.pending_cash,
    paymentIcon: COLLECT_ICON_MAP[order.payment] ?? COLLECT_ICON_MAP.pending_cash,
    paymentClassName: COLLECT_CLASS_MAP[order.payment] ?? COLLECT_CLASS_MAP.pending_cash,
    breakdown,
    paysWithText,
    cashChangeText,
  }
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

  // 4-bis. El latido. Ver `CardPulse`.
  //
  // La condición NO se escribe aquí: se pide a `demandsCashier`, que es la misma
  // llamada que enciende el sonido y el banner. Es el invariante «si suena, se
  // ve» dicho una vez más —si late, suena; si suena, late— y con el predicado
  // compartido no hay forma de que una de las tres se quede atrás.
  const pulse: CardPulse = !demandsCashier(order)
    ? 'none'
    : order.countdownSec < 60
      ? 'urgent'
      : 'attention'

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
  const money = buildMoney(order)

  // 6-bis. Destino. Ver `CardDestination`.
  const destination: CardDestination | null =
    order.method === 'pickup'
      ? { primary: 'Recojo en local', secondary: null }
      : order.addressRef
        ? { primary: order.addressRef, secondary: order.address }
        : order.address
          ? { primary: order.address, secondary: null }
          : null

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
    const isLateOrReady =
      order.comidaLista || (order.readySec != null && order.readySec < 0) || order.readySec == null
    if (isLateOrReady) {
      const alarma = order.state === 'buffer_p3'
      primaryAction = {
        type: 'callDriver',
        label: alarma ? 'Pedir motorizado YA' : 'Pedir motorizado',
        isUrgent: alarma,
        phoneToCall: supportPhone ?? undefined,
      }
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
    destination,
    money,
    riskLabel,
    primaryAction,
    tone,
    pulse,
  }
}
