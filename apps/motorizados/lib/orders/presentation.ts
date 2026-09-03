/**
 * El vocabulario visual del pedido, compartido por la TARJETA y el DETALLE.
 *
 * POR QUÉ EXISTE.
 * Las dos pantallas contaban lo mismo con palabras distintas, y no era una
 * cuestión de estilo: el detalle se había quedado con reglas viejas y una de
 * ellas costaba dinero. `money-card` condicionaba el vuelto a
 * `changeToGive != null`, y esa columna llega SIEMPRE NULL en los pedidos
 * manuales —el 100% del piloto—, así que el bloque del vuelto no se pintaba
 * nunca; el hero, peor, mostraba «vuelto S/ 0.00». La tarjeta ya lo derivaba
 * bien con `changeDue()` desde hacía tiempo. Dos copias de una regla divergen:
 * es la tercera vez que pasa en esta app.
 *
 * Estas funciones toman PRIMITIVAS, no filas. Es a propósito: la tarjeta lee
 * `orders` en snake_case y el detalle recibe camelCase del endpoint, así que
 * cualquier firma atada a una de las dos formas habría obligado a la otra a
 * duplicar. Aquí cada pantalla adapta lo suyo y la REGLA es una sola.
 */

import { soles } from '../format'
import { changeDue } from '../payment'

/** Tono semántico de urgencia. El componente lo traduce a clases. */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger'

/**
 * El color del ESTADO es categórico, no semántico: nombra la FASE, no la
 * gravedad, y por eso es un tipo aparte de `Tone`.
 *
 * En esta app el ámbar y el rojo son el idioma del reloj —"se te está pasando",
 * "ya se pasó"— y son los únicos dos colores que significan urgencia. Si un
 * estado normal usara cualquiera de los dos, una fase corriente sería
 * indistinguible de una alarma y el color dejaría de querer decir nada. Un
 * estado nunca es una alarma: es un hecho.
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
 */
/**
 * Cuán lejos cae la entrega. Vive aquí por lo mismo que todo lo demás de este
 * fichero: lo dicen la tarjeta y el detalle, y si cada una se guarda su copia
 * acaban llamando distinto a la misma banda.
 */
export const BAND_LABEL: Record<string, string> = { near: 'Cerca', far: 'Lejos' }

const OWN: Record<string, Badge> = {
  preparing: { icon: 'restaurant', text: 'En cocina', tone: 'idle' },
  waiting_driver: { icon: 'check_circle', text: 'Lista', tone: 'ready' },
  heading_to_restaurant: { icon: 'directions_bike', text: 'Voy al local', tone: 'transit' },
  waiting_at_restaurant: { icon: 'storefront', text: 'En el local', tone: 'onsite' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'carrying' },
  delivered: { icon: 'check_circle', text: 'Entregado', tone: 'done' },
}

/** Tercera persona: el pedido es de un compañero, no tuyo. */
const OTHER: Record<string, Badge> = {
  heading_to_restaurant: { icon: 'directions_bike', text: 'Va al local', tone: 'transit' },
  waiting_at_restaurant: { icon: 'storefront', text: 'En el local', tone: 'onsite' },
  picked_up: { icon: 'delivery_dining', text: 'En reparto', tone: 'carrying' },
}

export function orderStateBadge(status: string, thirdPerson = false): Badge | null {
  return (thirdPerson ? OTHER : OWN)[status] ?? null
}

/**
 * EL COBRO EN DOS ALTURAS: la cifra grande, y debajo lo que hay que saber de
 * ella.
 *
 * SIN VERBOS a propósito: "Cobrar en efectivo" solo se lee bien en presente y
 * la misma línea se pinta en el historial, donde ya se cobró. `S/ 45.00 /
 * efectivo` es cierto en cualquier tiempo verbal. La única excepción es el
 * prepago, donde la instrucción evita un error de plata.
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

export interface MoneyInput {
  paymentIntent: string | null
  /**
   * Cómo se cobró DE VERDAD (`orders.payment_real`), si ya se entregó.
   *
   * MANDA SOBRE EL PLAN, y por eso existe. Sin esto, un pedido planeado en
   * efectivo que el cliente acabó pagando por Yape seguía diciendo "efectivo"
   * en el historial: la pantalla describía la intención para siempre, y el
   * motorizado veía en su resumen un cobro que no hizo.
   */
  paymentReal?: string | null
  /** Comida + envío. */
  total: number
  cashAmount: number | null
  yapeAmount: number | null
  clientPaysWith: number | null
  changeToGive: number | null
  /**
   * Ya se cobró (historial). Silencia el vuelto: ahí ya se dio, y hablar de él
   * en pasado confunde. Se asume cuando llega `paymentReal`.
   */
  settled?: boolean
}

/**
 * Traduce el cobro REAL al mismo vocabulario que el planeado.
 *
 * `cash_amount`/`yape_amount` son de fiar aquí: `advance_order` los reescribe
 * con la división real cuando el cobro termina siendo mixto (0140).
 */
function settledLine(real: string, input: MoneyInput): MoneyLine {
  const { total } = input

  if (real === 'paid_prepaid') {
    return { headline: 'Prepagado', detail: 'no cobrado', tone: 'success' }
  }
  if (real === 'paid_yape') {
    return { headline: soles(total), detail: 'Yape/Plin', tone: 'neutral' }
  }
  if (real === 'paid_mixed' && input.cashAmount != null && input.yapeAmount != null) {
    return {
      headline: soles(input.cashAmount),
      detail: `efectivo + ${soles(input.yapeAmount)} Yape`,
      tone: 'neutral',
    }
  }
  if (real === 'paid_cash' || real === 'paid_mixed') {
    return { headline: soles(total), detail: 'efectivo', tone: 'neutral' }
  }
  // `unpaid` / `refunded`: no se inventa un cobro que no hubo.
  return { headline: soles(total), detail: 'sin cobrar', tone: 'neutral' }
}

export function moneyLine(input: MoneyInput): MoneyLine {
  const { paymentIntent: intent, total } = input

  // Entregado: lo que cuenta es lo que pasó, no lo que se había planeado.
  if (input.paymentReal) return settledLine(input.paymentReal, input)

  // LA PALABRA OCUPA EL SITIO DE LA CIFRA. Sin número no hay número que cobrar
  // por error, y la instrucción va debajo donde va el método en los demás: el
  // bloque se lee igual en los cuatro casos.
  if (intent === 'prepaid') {
    return { headline: 'Prepagado', detail: 'no cobrar', tone: 'success' }
  }

  // EL VUELTO SE DERIVA, NO SE LEE. `change_to_give` llega siempre NULL en los
  // pedidos manuales (ver `lib/payment.ts`), que son el 100% del piloto.
  const vuelto = input.settled
    ? null
    : changeDue({
        paymentIntent: intent,
        total,
        cashAmount: input.cashAmount,
        clientPaysWith: input.clientPaysWith,
        changeToGive: input.changeToGive,
      })

  const change = vuelto != null && vuelto > 0 ? ` · vuelto ${soles(vuelto)}` : ''

  if (intent === 'pending_mixed') {
    // LA CIFRA GRANDE ES LA PARTE EN EFECTIVO, NO EL TOTAL. En un pago mixto el
    // total no es un número que el motorizado maneje: no cuenta 45, cuenta 30 y
    // comprueba que entraron 15 por Yape. Enseñar además el total ponía tres
    // importes seguidos con el primero redundante, porque las dos partes ya
    // suman.
    if (input.cashAmount != null && input.yapeAmount != null) {
      return {
        headline: soles(input.cashAmount),
        detail: `efectivo + ${soles(input.yapeAmount)} Yape${change}`,
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

/**
 * Los cuatro momentos del reparto, para el paso a paso.
 *
 * SALE DEL `status`, NO DE UN ÍNDICE. El detalle pasaba `moment={0|1|2}` escrito
 * a mano en tres sitios de `page.tsx`: un número mágico que no podía estar de
 * acuerdo con la máquina de estados porque no la miraba. Y el cuarto paso
 * ("Listo") no se marcaba nunca como actual, porque el tipo no llegaba a 3.
 */
export const MOMENTS = ['Voy', 'Local', 'Camino', 'Listo'] as const

const MOMENT_BY_STATUS: Record<string, number> = {
  heading_to_restaurant: 0,
  waiting_at_restaurant: 1,
  picked_up: 2,
  delivered: 3,
}

/** Paso actual (0-3), o `null` si el pedido aún no está en manos de nadie. */
export function momentOf(status: string): number | null {
  return MOMENT_BY_STATUS[status] ?? null
}

/**
 * Umbral por encima del cual la lectura ya no sirve para acertar una puerta.
 *
 * 30 m, el mismo que usa el app del cliente al pedirla. Se repite el número a
 * propósito en vez de compartirlo: son dos apps que se despliegan por separado,
 * y un import entre ellas acoplaría sus versiones para ahorrar una constante.
 */
const PRECISION_SUFICIENTE_M = 30

export interface DeliveryPointQuality {
  tone: Tone
  /** Frase corta: de qué punto estamos hablando. */
  label: string
  /** Qué hacer con esa información. Vacío cuando no hay nada que advertir. */
  hint: string | null
}

/**
 * De qué calidad es el punto al que va el motorizado (migración 0207).
 *
 * POR QUÉ IMPORTA. Hasta ahora el pedido traía una coordenada y punto: un pin
 * de ±8 m, uno puesto a dedo y uno que NADIE eligió —el centro del pueblo, que
 * la app del cliente plantaba sola— se veían exactamente igual. Quien conduce
 * decidía si fiarse sin ningún dato. En producción hay cinco direcciones
 * apuntando a la plaza ahora mismo.
 *
 * Los dos significados de la ausencia son los de la 0202 y la 0147, y aquí se
 * cuentan por separado porque llevan a acciones distintas: «puesto a mano» es
 * un punto bueno sin medida, y «sin confirmar» es un punto en el que no hay que
 * creer.
 */
export function deliveryPointQuality(
  confirmedAt: string | null,
  accuracyM: number | null,
): DeliveryPointQuality {
  if (!confirmedAt) {
    return {
      tone: 'warning',
      label: 'Sin punto confirmado',
      hint: 'Nadie marcó este pin. Guíate por la referencia.',
    }
  }
  if (accuracyM == null) {
    return { tone: 'neutral', label: 'Punto marcado a mano', hint: null }
  }
  if (accuracyM > PRECISION_SUFICIENTE_M) {
    return {
      tone: 'warning',
      label: `GPS aproximado · ±${accuracyM} m`,
      hint: 'Puede estar a una cuadra. Confirma con la referencia.',
    }
  }
  return { tone: 'success', label: `GPS ±${accuracyM} m`, hint: null }
}
