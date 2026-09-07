/**
 * Lectura del panel «Rendimiento»: tipos del payload que devuelve
 * `business_performance_metrics` y la interpretación que se deriva de él.
 *
 * Vive en `core` y no en la app porque el panel y el PDF tienen que decir
 * EXACTAMENTE lo mismo. Si cada uno derivara sus propias conclusiones, el día
 * que una cambie el negocio leerá dos diagnósticos distintos del mismo mes.
 *
 * Todo aquí es puro: entra el payload, sale texto y números. Sin I/O.
 *
 * ── POR QUÉ ESTE ARCHIVO TIENE TONO ─────────────────────────────────────────
 *
 * Quien abre esta pantalla no es un analista: es el dueño de un local de pueblo
 * mirando cómo le fue la semana. La versión anterior le daba cifras correctas y
 * frías, y eso tenía un efecto medible sobre el que peor estaba: corriendo
 * `buildInsights` contra prod el 2026-09-07, el local más flojo de San Jacinto
 * recibía UNA sola frase — «Facturaste 68.3% menos que el periodo anterior» —
 * porque todos los umbrales de muestra lo dejaban mudo. El que más ayuda
 * necesitaba era el único al que el panel solo sabía regañar.
 *
 * De ahí las tres piezas nuevas, y el orden en que hablan:
 *
 *   `buildMood`    — reconoce el momento ANTES de dar el dato. Con carita,
 *                    porque a esa hora y en ese teléfono un emoji comunica el
 *                    tono más rápido que cualquier adjetivo.
 *   `buildGoal`    — una meta, no solo un retrovisor. Sale de su propio récord:
 *                    ya la logró una vez, así que no es un número inventado por
 *                    Tindivo ni la vara de otro local.
 *   `buildBoost`   — cuando la cosa está floja, Tindivo se ofrece a ayudar en
 *                    vez de limitarse a informar de que está floja.
 *
 * REGLA QUE NO SE ROMPE: el tono adorna, nunca sustituye ni suaviza el número.
 * Una caída del 40% se dice que es del 40%. Lo que cambia es que va acompañada.
 */

export interface PerformancePeriod {
  start: string
  end: string
  days: number
}

export interface PerformanceCurrent {
  revenue: number
  delivered: number
  cancelled: number
  deliveryFees: number
  ticket: number
  /** Jornadas DISTINTAS con al menos un pedido entregado. El divisor honesto. */
  nights: number
}

export interface PerformancePrevious {
  start: string
  end: string
  revenue: number
  delivered: number
  ticket: number
  nights: number
}

/** Lo que el periodo le generó de deuda al negocio, leído de `business_charges`. */
export interface PerformanceBill {
  commission: number
  deliveryFee: number
  refund: number
  total: number
}

export interface PerformanceCustomers {
  total: number
  new: number
  returning: number
}

export interface PerformanceDailyPoint {
  date: string
  orders: number
  revenue: number
}

export interface PerformanceWeekdayPoint {
  /** 0 = domingo … 6 = sábado (igual que `extract(dow)`). */
  dow: number
  orders: number
  revenue: number
  ticket: number
}

/** La jornada en curso, que va aparte del rango porque aún no ha terminado. */
export interface PerformanceTonight {
  date: string
  orders: number
  revenue: number
  /** Pedidos vivos ahora mismo (ni entregados ni cancelados). */
  active: number
  /** `true` si el rango elegido ya la incluye, para no contarla dos veces. */
  inRange: boolean
}

/** La mejor racha propia, del mismo largo que el rango elegido. */
export interface PerformanceRecordWindow {
  start: string
  end: string
  orders: number
  revenue: number
  days: number
}

export interface PerformanceRecordNight {
  date: string
  orders: number
  revenue: number
}

export interface PerformanceRecord {
  window: PerformanceRecordWindow | null
  night: PerformanceRecordNight | null
}

/**
 * La referencia del pueblo: medianas agregadas, sin nombres.
 *
 * `businesses` viaja para poder callarse. Con menos de tres locales activos la
 * «mediana del pueblo» no es una referencia: es la caja del vecino con otro
 * nombre, y eso no se enseña.
 */
export interface PerformanceTown {
  businesses: number
  ordersPerNight: number
  revenuePerNight: number
  ticket: number
}

export interface PerformancePayload {
  period: PerformancePeriod
  current: PerformanceCurrent
  previous: PerformancePrevious
  bill: PerformanceBill
  customers: PerformanceCustomers
  daily: PerformanceDailyPoint[]
  weekday: PerformanceWeekdayPoint[]
  weekdayWindow: { start: string; end: string; weeks: number }
  tonight: PerformanceTonight
  record: PerformanceRecord
  town: PerformanceTown
}

export const WEEKDAY_LABELS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const

/**
 * Plural para frases del tipo «los sábados».
 *
 * En castellano los días de lunes a viernes son invariables («los lunes»), pero
 * sábado y domingo sí pluralizan. Usar la forma singular para todos daba «los
 * sábado», que es lo primero que salta al leer el panel.
 */
export const WEEKDAY_PLURAL = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
] as const

/** Orden de presentación: la semana peruana empieza el lunes, no el domingo. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

// ── Comparación contra el periodo anterior ───────────────────────────────────

export interface Delta {
  /** Diferencia absoluta (actual − anterior). */
  abs: number
  /** Variación porcentual, o `null` si la base era 0 (no existe el porcentaje). */
  pct: number | null
  direction: 'up' | 'down' | 'flat'
  /** `false` cuando el periodo anterior no tuvo actividad: no hay con qué comparar. */
  comparable: boolean
}

export function computeDelta(current: number, previous: number): Delta {
  const abs = round2(current - previous)
  // Base 0: la variación porcentual no existe (dividir entre cero). Se marca
  // como no comparable para que la UI muestre «sin periodo previo» en vez de
  // un «+∞%» o un «+100%» inventado.
  if (previous === 0) {
    return { abs, pct: null, direction: current > 0 ? 'up' : 'flat', comparable: false }
  }
  const pct = round1(((current - previous) / previous) * 100)
  return {
    abs,
    pct,
    direction: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat',
    comparable: true,
  }
}

/**
 * Media por noche trabajada. `0` cuando no trabajó ninguna: no es que vendiera
 * cero por noche, es que no hubo noches, y las dos cosas se distinguen mirando
 * `nights` al lado.
 */
export function perNight(total: number, nights: number): number {
  return nights > 0 ? round2(total / nights) : 0
}

/**
 * LA comparación del panel, y la razón de casi todo lo que cambió aquí.
 *
 * Comparar totales de dos ventanas exige que ambas hayan trabajado las mismas
 * noches, y eso no pasa nunca. En prod al 2026-09-07 el local más grande hizo
 * 73 pedidos en 6 noches contra 77 en 7: por noche SUBIÓ un 11%, y el panel le
 * enseñaba una flecha roja de −3.3% porque el rango incluía la jornada en
 * curso, todavía vacía. El dueño no había hecho nada mal; el divisor sí.
 *
 * Dividir entre noches trabajadas quita ese sesgo y además da la cifra en la
 * que él ya piensa: cuántos pedidos le entran una noche cualquiera.
 */
export function computePerNightDelta(
  currentTotal: number,
  currentNights: number,
  previousTotal: number,
  previousNights: number,
): Delta {
  return computeDelta(
    perNight(currentTotal, currentNights),
    perNight(previousTotal, previousNights),
  )
}

// ── La meta ──────────────────────────────────────────────────────────────────

export type GoalState =
  /** Batió su mejor racha anterior. */
  | 'record'
  /** La igualó exactamente. */
  | 'tied'
  /** A un suspiro (≥85%). */
  | 'close'
  /** En camino (≥60%). */
  | 'onTrack'
  /** Lejos (<60%). */
  | 'behind'
  /** Todavía no tiene historia suficiente para tener récord. */
  | 'noBaseline'

export interface PerformanceGoal {
  state: GoalState
  /** Pedidos entregados en el periodo. */
  orders: number
  /** La meta: los pedidos de su mejor racha del mismo largo. */
  target: number
  /** 0..1, tope en 1. */
  progress: number
  /** Cuántos pedidos le faltan para igualarla. 0 si ya la igualó. */
  missing: number
  /** Cuándo hizo ese récord, para que sepa que es suyo y no un invento. */
  window: { start: string; end: string } | null
}

const GOAL_CLOSE = 0.85
const GOAL_ON_TRACK = 0.6

/**
 * La meta sale del récord PROPIO, no de una vara puesta por Tindivo.
 *
 * Es la única meta que se puede defender delante del dueño: ya la consiguió una
 * vez, con su local, su carta y su pueblo. Una meta inventada por la plataforma
 * («apunta a 50 pedidos») es una cifra que no significa nada para él, y si no la
 * alcanza el panel se convierte en algo que evita abrir.
 *
 * El récord viene ya acotado al PASADO desde la 0222 (ventanas que terminan
 * antes del periodo). Si incluyera el periodo actual, la meta sería el propio
 * dato que tiene al lado y la barra marcaría 100% para siempre.
 */
export function buildGoal(payload: PerformancePayload): PerformanceGoal {
  const orders = payload.current.delivered
  const rec = payload.record.window

  if (!rec || rec.orders <= 0) {
    return { state: 'noBaseline', orders, target: 0, progress: 0, missing: 0, window: null }
  }

  const target = rec.orders
  const progress = Math.min(1, round2(orders / target))
  const missing = Math.max(0, target - orders)
  const window = { start: rec.start, end: rec.end }

  // Se comparan enteros y no `progress >= 1`: el redondeo a dos decimales
  // podría dar 1 con un pedido todavía pendiente y anunciar un récord falso.
  if (orders > target) return { state: 'record', orders, target, progress: 1, missing: 0, window }
  if (orders === target) return { state: 'tied', orders, target, progress: 1, missing: 0, window }
  if (progress >= GOAL_CLOSE) return { state: 'close', orders, target, progress, missing, window }
  if (progress >= GOAL_ON_TRACK)
    return { state: 'onTrack', orders, target, progress, missing, window }
  return { state: 'behind', orders, target, progress, missing, window }
}

// ── El ánimo: cómo se le habla antes de darle el dato ────────────────────────

export type MoodLevel = 'celebrating' | 'good' | 'steady' | 'soft' | 'worried'

export interface PerformanceMood {
  level: MoodLevel
  /** La carita. Es lo primero que se lee y fija el tono de todo lo de abajo. */
  emoji: string
  headline: string
  /** Dos o tres frases. Reconoce y explica; no sermonea. */
  body: string
  /** `true` cuando toca ofrecer ayuda en vez de solo informar. */
  offerHelp: boolean
}

/** Por debajo de esto la caída ya no es ruido de una semana. */
const MOOD_DROP_PCT = -20
/** Por encima de esto la subida merece decirse. */
const MOOD_RISE_PCT = 10

/**
 * El ánimo del periodo, en orden de CAUSA, no de gravedad.
 *
 * El orden importa más que los umbrales. Un local que abrió dos de siete noches
 * vendió poco por una razón que no es «vender mal», y decirle «facturaste 68%
 * menos» es darle un diagnóstico falso sobre el que va a actuar: bajará precios
 * cuando lo que le pasa es que estuvo cerrado. Por eso las noches se miran
 * antes que la facturación, y la facturación antes que el récord.
 */
export function buildMood(payload: PerformancePayload): PerformanceMood {
  const { current, previous, period } = payload
  const goal = buildGoal(payload)
  const nightsDelta = computePerNightDelta(
    current.delivered,
    current.nights,
    previous.delivered,
    previous.nights,
  )

  // 1. Ni un solo pedido. Aquí no hay nada que analizar y sí alguien a quien
  //    acompañar: es la pantalla que más fácil hace que alguien se rinda.
  if (current.delivered === 0) {
    return {
      level: 'worried',
      emoji: '😔',
      headline: 'Esta vez no entró ningún pedido',
      // Sin periodo anterior NO se afirma que no haya entregado nunca: el
      // payload solo conoce dos ventanas, y la jornada en curso queda fuera de
      // las dos. Renderizando el panel en local se veía la contradicción en la
      // misma pantalla — «todavía no has entregado tu primer pedido» arriba y
      // «1 pedido entregado» en la tarjeta de esta noche, justo debajo.
      body: previous.delivered
        ? `El periodo anterior entregaste ${previous.delivered} ${plural(previous.delivered, 'pedido', 'pedidos')}, así que sabemos que la gente sí te pide. Algo se cortó y no tiene por qué quedarse así.`
        : 'Tampoco hubo ninguno en el periodo anterior. Arrancar cuesta, y no tienes que hacerlo solo.',
      offerHelp: true,
    }
  }

  // 2. Estuvo cerrado más de lo que abrió. Es la causa, no el síntoma.
  if (period.days >= 5 && current.nights > 0 && current.nights * 2 <= period.days) {
    return {
      level: 'soft',
      emoji: '🌙',
      headline: `Trabajaste ${current.nights} de ${period.days} noches`,
      body: `Vendiste ${soles(perNight(current.revenue, current.nights))} por noche trabajada, que no está mal — el problema es cuántas fueron. Cada noche que no abres es una noche en la que tus clientes piden en otro sitio y se acostumbran.`,
      offerHelp: true,
    }
  }

  // 3. Récord. Se celebra fuerte: es la única pantalla donde puede leer que le
  //    está yendo mejor que nunca.
  if (goal.state === 'record' || goal.state === 'tied') {
    const batio = goal.state === 'record'
    return {
      level: 'celebrating',
      emoji: '🎉',
      headline: batio ? '¡Es tu mejor racha hasta ahora!' : '¡Igualaste tu mejor racha!',
      body: `${current.delivered} ${plural(current.delivered, 'pedido', 'pedidos')} y ${soles(current.revenue)} en comida. ${
        batio
          ? `Tu mejor marca en ${period.days} días eran ${goal.target}, y la acabas de pasar.`
          : `Es exactamente tu mejor marca en ${period.days} días.`
      } Lo que estés haciendo esta vez, no lo cambies.`,
      offerHelp: false,
    }
  }

  // La misma cautela que en `buildInsights`: un porcentaje sobre tres pedidos
  // no describe una tendencia, y el ánimo de la pantalla no puede colgar de
  // ruido. Sin muestra se cae a «vas parejo», que con esas cifras es la verdad.
  const tendenciaFiable =
    current.delivered >= MIN_ORDERS_FOR_TREND &&
    previous.delivered >= MIN_ORDERS_FOR_TREND &&
    nightsDelta.comparable &&
    nightsDelta.pct !== null

  // 4. Caída real, ya normalizada por noche: no es el calendario, es el negocio.
  if (tendenciaFiable && nightsDelta.pct !== null && nightsDelta.pct <= MOOD_DROP_PCT) {
    return {
      level: 'soft',
      emoji: '😕',
      headline: `Bajaste ${fmtPct(Math.abs(nightsDelta.pct))} por noche`,
      body: `De ${fmtOrders(perNight(previous.delivered, previous.nights))} a ${fmtOrders(perNight(current.delivered, current.nights))} pedidos por noche. Puede ser la quincena, el clima o la competencia — pero si se repite otra semana, conviene mover algo.`,
      offerHelp: true,
    }
  }

  // 5. Subida clara.
  if (tendenciaFiable && nightsDelta.pct !== null && nightsDelta.pct >= MOOD_RISE_PCT) {
    return {
      level: 'good',
      emoji: '😄',
      headline: `Subiste ${fmtPct(nightsDelta.pct)} por noche`,
      body: `De ${fmtOrders(perNight(previous.delivered, previous.nights))} a ${fmtOrders(perNight(current.delivered, current.nights))} pedidos por noche.${
        goal.state === 'close' && goal.missing > 0
          ? ` Te faltan ${goal.missing} ${plural(goal.missing, 'pedido', 'pedidos')} para igualar tu récord.`
          : ' Vas para arriba.'
      }`,
      offerHelp: false,
    }
  }

  // 6. Todo lo demás: parejo. Ni drama ni fiesta.
  //
  //    Aquí caen dos casos distintos y no pueden decir lo mismo: el que de
  //    verdad se movió poco, y el que tiene tan pocos pedidos que no se puede
  //    afirmar nada. Al segundo se le dice eso, no «vas parejo»: con cuatro
  //    pedidos «parejo» suena a que su nivel es ese, y no lo sabemos.
  const porNoche = fmtOrders(perNight(current.delivered, current.nights))
  const nochesTxt = `${current.nights} ${plural(current.nights, 'noche', 'noches')}`
  const colaMeta =
    goal.state !== 'noBaseline' && goal.missing > 0
      ? `Tu récord son ${goal.target} pedidos; te faltan ${goal.missing}.`
      : 'Una base estable es de donde se crece.'

  if (!tendenciaFiable) {
    return {
      level: 'steady',
      emoji: '🙂',
      headline: 'Todavía son pocos pedidos para sacar conclusiones',
      body: `${current.delivered} ${plural(current.delivered, 'pedido', 'pedidos')} en ${nochesTxt}. Con estas cantidades cualquier porcentaje engaña, así que preferimos no inventarte una tendencia. ${colaMeta}`,
      offerHelp: current.delivered < MIN_ORDERS_FOR_TREND,
    }
  }

  return {
    level: 'steady',
    emoji: '🙂',
    headline: 'Vas parejo',
    body: `${porNoche} pedidos por noche en ${nochesTxt}, muy parecido al periodo anterior. ${colaMeta}`,
    offerHelp: false,
  }
}

// ── La oferta de Tindivo ─────────────────────────────────────────────────────

export interface PerformanceBoost {
  headline: string
  body: string
  /**
   * Lo que Tindivo hace de verdad, hoy, a mano.
   *
   * NADA DE ESTO ES UNA FUNCIÓN DEL PANEL. No hay tabla de promociones ni forma
   * de destacar un local en el catálogo (`/public/businesses` ordena por
   * nombre). Prometer un botón que no existe se descubre al primer clic y
   * quema la única carta que tiene Tindivo con estos negocios, que es la
   * confianza. Así que se ofrece lo que una persona puede hacer esta semana.
   */
  bullets: string[]
  /** El mensaje que llega al WhatsApp de Tindivo, con las cifras ya dentro. */
  whatsappMessage: string
}

/**
 * `null` cuando no toca. La oferta solo aparece si el ánimo pide ayuda: dársela
 * a quien va batiendo su récord la convierte en publicidad de fondo, y la
 * siguiente vez que salga de verdad ya nadie la mirará.
 */
export function buildBoost(
  payload: PerformancePayload,
  businessName: string,
): PerformanceBoost | null {
  const mood = buildMood(payload)
  if (!mood.offerHelp) return null

  const { current, period, town } = payload
  const misPorNoche = perNight(current.delivered, current.nights)
  const bajoLaMediana =
    town.businesses >= MIN_TOWN_BUSINESSES &&
    town.ordersPerNight > 0 &&
    misPorNoche < town.ordersPerNight

  // Los bullets se ordenan por LA CAUSA que detectó el ánimo, no siempre igual.
  // Al que le faltan noches, lo primero es la noche; al que vende menos por
  // noche, lo primero es la carta. Mandarle a los dos la misma lista genérica es
  // la forma más rápida de que deje de leerla.
  const bullets: string[] = []
  if (current.nights < period.days) {
    bullets.push('Vemos qué te está costando abrir todas las noches y si podemos aligerarlo.')
  }
  bullets.push(
    'Miramos juntos tu carta: qué platos no se están vendiendo y a qué precio.',
    'Armamos una promo para tus noches flojas y la anunciamos por nuestros canales.',
  )
  // Lo que se anuncia sale por los canales de TINDIVO (su página, sus redes), no
  // escribiéndole a la lista de clientes. Esos teléfonos los dieron para que les
  // llegara su pedido, no para recibir publicidad de otro local, y prometer aquí
  // algo que después habría que hacer con ellos sería comprometer a Tindivo a
  // usarlos para lo que no son.
  bullets.push('Te damos espacio en las publicaciones de Tindivo San Jacinto.')

  return {
    headline: 'No tienes que levantarlo solo',
    body: bajoLaMediana
      ? `El local típico de San Jacinto va en ${fmtOrders(town.ordersPerNight)} pedidos por noche y tú en ${fmtOrders(misPorNoche)}. Esa diferencia se cierra, y nos toca ayudarte a cerrarla: si a ti te va bien, a nosotros también.`
      : 'Tindivo no vive de cobrarte comisión: vive de que vendas. Si esta racha no se endereza sola, la trabajamos contigo.',
    bullets,
    whatsappMessage: buildBoostMessage(payload, businessName, mood),
  }
}

/**
 * El mensaje se manda con las cifras dentro a propósito.
 *
 * Quien lo recibe está en WhatsApp, no en el panel. Si llega un «hola, quiero
 * ayuda» hay que pedirle el nombre, abrir el panel y buscar el periodo antes de
 * poder contestar nada, y esa fricción se come la conversación. Con los números
 * puestos, la primera respuesta ya puede ser útil.
 */
export function buildBoostMessage(
  payload: PerformancePayload,
  businessName: string,
  mood: PerformanceMood = buildMood(payload),
): string {
  const { current, period } = payload
  return [
    `Hola Tindivo, soy ${businessName}.`,
    `Vi mi rendimiento del ${period.start} al ${period.end}: ${current.delivered} ${plural(current.delivered, 'pedido', 'pedidos')} en ${current.nights} ${plural(current.nights, 'noche', 'noches')} (${soles(current.revenue)}).`,
    `El panel me dice: «${mood.headline}».`,
    'Quiero que veamos juntos cómo levantarlo.',
  ].join('\n')
}

// ── Diagnóstico y recomendaciones ────────────────────────────────────────────

export type InsightTone = 'good' | 'warn' | 'info'

export interface Insight {
  id: string
  tone: InsightTone
  /** Titular corto: el hallazgo. */
  title: string
  /** Qué hacer con él. */
  action: string
}

/**
 * Muestras mínimas antes de afirmar nada. Un negocio con 4 pedidos no tiene
 * «patrón semanal»: tiene cuatro pedidos. Recomendar sobre ruido es peor que
 * callarse, porque el negocio actúa sobre ello.
 *
 * Estos umbrales siguen siendo correctos y no se tocan. Lo que se añadió son
 * hallazgos que NO necesitan muestra grande — noches trabajadas, récord,
 * mediana del pueblo — porque el silencio total era peor: dejaba al local más
 * flojo con una sola frase, y encima la más dura.
 */
const MIN_ORDERS_FOR_WEEKDAY = 20
const MIN_ORDERS_PER_WEEKDAY = 3
const MIN_CUSTOMERS_FOR_RETENTION = 15
/** Por debajo de tres locales activos, «la mediana del pueblo» es el vecino. */
const MIN_TOWN_BUSINESSES = 3
/**
 * Pedidos mínimos a cada lado para que un porcentaje de tendencia signifique
 * algo. Con dos pedidos, un tercero mueve la cifra un 50%.
 */
const MIN_ORDERS_FOR_TREND = 5

/** Días de la semana con muestra suficiente para compararse entre sí. */
function usableWeekdays(weekday: PerformanceWeekdayPoint[]): PerformanceWeekdayPoint[] {
  return weekday.filter((w) => w.orders >= MIN_ORDERS_PER_WEEKDAY)
}

export function bestWeekdayByTicket(
  weekday: PerformanceWeekdayPoint[],
): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 2) return null
  return usable.reduce((best, w) => (w.ticket > best.ticket ? w : best))
}

export function bestWeekdayByVolume(
  weekday: PerformanceWeekdayPoint[],
): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 2) return null
  return usable.reduce((best, w) => (w.orders > best.orders ? w : best))
}

export function weakestWeekday(weekday: PerformanceWeekdayPoint[]): PerformanceWeekdayPoint | null {
  const usable = usableWeekdays(weekday)
  if (usable.length < 3) return null
  return usable.reduce((worst, w) => (w.orders < worst.orders ? w : worst))
}

/**
 * Convierte el payload en 2-4 frases accionables, ordenadas por lo que más
 * mueve la aguja. Devuelve lista vacía si no hay datos que sostengan ninguna:
 * el panel muestra entonces «aún no hay suficiente historial», que es la
 * verdad, en vez de un consejo genérico que valdría para cualquier local.
 */
export function buildInsights(payload: PerformancePayload): Insight[] {
  const out: Insight[] = []
  const { current, previous, customers, weekday, period, town } = payload
  const totalWeekdayOrders = weekday.reduce((s, w) => s + w.orders, 0)

  // 1. LAS NOCHES, ANTES QUE EL DINERO.
  //    Va primera porque explica todo lo que viene detrás y porque funciona con
  //    muestra de dos pedidos, que es justo donde el resto de umbrales callan.
  //    Una noche sin abrir no es solo la venta de esa noche: es un cliente que
  //    prueba otro local y a veces se queda.
  const noches = current.nights
  if (period.days >= 5 && noches < period.days) {
    const perdidas = period.days - noches
    const porNoche = perNight(current.revenue, noches)
    if (noches === 0) {
      out.push({
        id: 'nights',
        tone: 'warn',
        title: `No entregaste ningún pedido en ${period.days} días`,
        action:
          'Revisa que tu local aparezca abierto en la página y que tu carta tenga platos disponibles. Si todo está bien y aun así no entra nada, escríbenos: eso no se arregla mirando el panel.',
      })
    } else if (noches * 2 <= period.days) {
      out.push({
        id: 'nights',
        tone: 'warn',
        title: `Trabajaste ${noches} de ${period.days} ${plural(period.days, 'noche', 'noches')}`,
        action: `Las noches que abriste vendiste ${soles(porNoche)} de promedio. Si abrieras ${perdidas} ${plural(perdidas, 'noche', 'noches')} más al mismo ritmo serían ${soles(round2(porNoche * perdidas))} más en el periodo. Tu problema no es cuánto vendes por noche: es cuántas noches.`,
      })
    } else if (perdidas >= 2) {
      out.push({
        id: 'nights',
        tone: 'info',
        title: `Te faltaron ${perdidas} ${plural(perdidas, 'noche', 'noches')} de ${period.days}`,
        action: `A tu ritmo de ${soles(porNoche)} por noche, esas ${plural(perdidas, 'noche', 'noches')} valían unos ${soles(round2(porNoche * perdidas))}. Si son días que cierras a propósito, ignóralo; si se te pasaron, ahí está la plata más fácil de recuperar.`,
      })
    }
  }

  // 2. La tendencia, YA NORMALIZADA POR NOCHE.
  //    Antes se comparaban los totales de dos ventanas que no habían trabajado
  //    los mismos días, y el resultado podía invertir el signo de la realidad.
  //
  //    CON MUESTRA SUFICIENTE, y por una razón concreta: al local más flojo de
  //    prod (2 pedidos en 2 noches contra 5 en 4) le salía «cada noche facturas
  //    36.6% menos», que sobre dos pedidos es ruido puro — y encima
  //    CONTRADECÍA al mensaje de arriba, que le decía que su venta por noche
  //    estaba bien y que su problema eran las noches cerradas. Dos frases
  //    opuestas en la misma pantalla no es un matiz: es perder al lector.
  const revDelta = computePerNightDelta(
    current.revenue,
    current.nights,
    previous.revenue,
    previous.nights,
  )
  const muestraSuficiente =
    current.delivered >= MIN_ORDERS_FOR_TREND && previous.delivered >= MIN_ORDERS_FOR_TREND
  if (
    muestraSuficiente &&
    revDelta.comparable &&
    revDelta.pct !== null &&
    Math.abs(revDelta.pct) >= 5
  ) {
    const subio = revDelta.direction === 'up'
    const actual = perNight(current.revenue, current.nights)
    const anterior = perNight(previous.revenue, previous.nights)
    out.push({
      id: 'trend',
      tone: subio ? 'good' : 'warn',
      title: subio
        ? `Cada noche facturas ${fmtPct(revDelta.pct)} más que antes`
        : `Cada noche facturas ${fmtPct(Math.abs(revDelta.pct))} menos que antes`,
      action: subio
        ? `Pasaste de ${soles(anterior)} a ${soles(actual)} por noche. Mira qué cambió y sostenlo.`
        : `Bajaste de ${soles(anterior)} a ${soles(actual)} por noche. Revisa si fue menos pedidos (${fmtOrders(perNight(previous.delivered, previous.nights))} → ${fmtOrders(perNight(current.delivered, current.nights))} por noche) o ticket más bajo (${soles(previous.ticket)} → ${soles(current.ticket)}).`,
    })
  }

  // 3. La meta, cuando está cerca. Un «te faltan 3» mueve más que cualquier
  //    porcentaje, y solo se dice si de verdad le falta poco: repetirle que
  //    está al 20% de su récord no es una meta, es un recordatorio de que va mal.
  const goal = buildGoal(payload)
  if (goal.state === 'record' || goal.state === 'tied') {
    const batio = goal.state === 'record'
    out.push({
      id: 'goal',
      tone: 'good',
      title: batio
        ? `Récord: ${goal.orders} ${plural(goal.orders, 'pedido', 'pedidos')}, ${goal.orders - goal.target} más que tu mejor marca`
        : `Igualaste tu récord: ${goal.orders} ${plural(goal.orders, 'pedido', 'pedidos')}`,
      action: `Tu mejor racha de ${period.days} días eran ${goal.target} pedidos (${goal.window?.start} al ${goal.window?.end}). Apunta qué platos y qué precios tienes ahora mismo: es lo que vas a querer repetir el mes que viene.`,
    })
  } else if (goal.state === 'close' && goal.missing > 0) {
    out.push({
      id: 'goal',
      tone: 'info',
      title: `Te faltan ${goal.missing} ${plural(goal.missing, 'pedido', 'pedidos')} para tu récord`,
      action: `Tu mejor racha de ${period.days} días fueron ${goal.target} pedidos (${goal.window?.start} al ${goal.window?.end}). Estás a ${goal.missing} de igualarla.`,
    })
  }

  // 4. La referencia del pueblo. Solo cuando está POR DEBAJO y solo si hay
  //    suficientes locales para que la mediana no señale a nadie: decirle al que
  //    va primero que va primero no le sirve de nada, y decírselo con nombres a
  //    cualquiera sería enseñar la caja del vecino.
  if (town.businesses >= MIN_TOWN_BUSINESSES && town.ordersPerNight > 0 && current.nights > 0) {
    const mio = perNight(current.delivered, current.nights)
    if (mio < town.ordersPerNight * 0.8) {
      out.push({
        id: 'town',
        tone: 'info',
        title: `El local típico del pueblo hace ${fmtOrders(town.ordersPerNight)} pedidos por noche`,
        action: `Tú vas en ${fmtOrders(mio)}. No es una carrera contra nadie: es que la demanda para llegar ahí ya existe en San Jacinto. Escríbenos y vemos qué falta.`,
      })
    }
  }

  // 5. El día fuerte, por ticket: es la palanca más directa sobre la caja.
  if (totalWeekdayOrders >= MIN_ORDERS_FOR_WEEKDAY) {
    const mejorTicket = bestWeekdayByTicket(weekday)
    const flojo = weakestWeekday(weekday)

    if (mejorTicket && flojo && mejorTicket.dow !== flojo.dow) {
      const usable = usableWeekdays(weekday)
      const peorTicket = usable.reduce((w, x) => (x.ticket < w.ticket ? x : w))
      const brecha =
        peorTicket.ticket > 0
          ? round1(((mejorTicket.ticket - peorTicket.ticket) / peorTicket.ticket) * 100)
          : 0

      if (brecha >= 15) {
        out.push({
          id: 'best-weekday',
          tone: 'info',
          title: `Los ${WEEKDAY_PLURAL[mejorTicket.dow]} tu ticket es ${fmtPct(brecha)} más alto`,
          action: `${soles(mejorTicket.ticket)} por pedido frente a ${soles(peorTicket.ticket)} los ${WEEKDAY_PLURAL[peorTicket.dow]}. Es el día para combos y platos grandes.`,
        })
      }

      if (flojo.orders > 0 && mejorTicket.orders >= flojo.orders * 1.5) {
        out.push({
          id: 'weak-weekday',
          tone: 'warn',
          title: `Los ${WEEKDAY_PLURAL[flojo.dow]} son tu día flojo`,
          action: `${flojo.orders} pedidos en 8 semanas, contra ${bestWeekdayByVolume(weekday)?.orders ?? 0} de tu mejor día. Una promo puntual ahí no te compite con tu propio fin de semana.`,
        })
      }
    }
  }

  // 6. Retención: barata de mover y la que sostiene el negocio a la larga.
  if (customers.total >= MIN_CUSTOMERS_FOR_RETENTION) {
    const tasa = round1((customers.returning / customers.total) * 100)
    if (tasa < 25) {
      out.push({
        id: 'retention',
        tone: 'warn',
        title: `Solo ${tasa}% de tus clientes del periodo ya había pedido antes`,
        action: `${customers.new} de ${customers.total} son primera vez. Traer gente nueva cuesta; que vuelvan, no. Un detalle en la bolsa del primer pedido es lo más barato que puedes probar.`,
      })
    } else {
      out.push({
        id: 'retention',
        tone: 'good',
        title: `${tasa}% de tus clientes del periodo ya te había comprado`,
        action: `${customers.returning} de ${customers.total} volvieron. Esa base es la que aguanta las semanas flojas.`,
      })
    }
  }

  // 7. Cancelaciones: solo si pesan de verdad sobre el periodo.
  const totalCerrados = current.delivered + current.cancelled
  if (totalCerrados >= 10 && current.cancelled > 0) {
    const tasa = round1((current.cancelled / totalCerrados) * 100)
    if (tasa >= 10) {
      out.push({
        id: 'cancellations',
        tone: 'warn',
        title: `${tasa}% de tus pedidos del periodo se cancelaron`,
        action: `${current.cancelled} de ${totalCerrados}. Si fue por fraude, puedes reclamar cobertura desde Historial.`,
      })
    }
  }

  return out.slice(0, 4)
}

// ── Formato ──────────────────────────────────────────────────────────────────

/**
 * `S/ 2,165.30`.
 *
 * Con separador de miles porque la cifra la lee alguien de noche, en un
 * teléfono, entre pedido y pedido: «S/ 2165.30» obliga a contar los dígitos
 * para saber si son dos mil o veintiún mil, y ese medio segundo es justo el que
 * no tiene. `toLocaleString` con `es-PE` da el punto y la coma peruanos.
 */
export function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Sin decimales cuando es redondo: «9%» lee mejor que «9.0%». */
export function fmtPct(n: number): string {
  const abs = Math.abs(n)
  return `${Number.isInteger(abs) ? abs : abs.toFixed(1)}%`
}

/**
 * Pedidos por noche: «12» o «3.4», nunca «3.40».
 *
 * Es una media, así que el decimal informa, pero el segundo decimal no: nadie
 * distingue 3.40 de 3.44 pedidos por noche y el ruido hace que la cifra parezca
 * más precisa de lo que es.
 */
export function fmtOrders(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** «1 noche» / «3 noches», sin repetir el ternario en cada frase. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
