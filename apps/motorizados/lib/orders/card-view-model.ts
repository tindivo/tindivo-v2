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
import type { CardOrder } from '../types'
import {
  type Badge,
  type MoneyLine,
  moneyLine,
  orderStateBadge,
  type StateTone,
  type Tone,
} from './presentation'

export type { Badge, MoneyLine, StateTone, Tone }

export type CardVariant = 'available' | 'mine' | 'delivered' | 'team'

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

// El ESTADO y el COBRO viven en `presentation.ts`, compartidos con el detalle.
// Tenerlos aquí los dejaba divergir, y ya lo habían hecho: el detalle se había
// quedado con una regla vieja del vuelto que no lo enseñaba nunca.

export interface CardVM {
  /** Cejilla: local y código. `shortId` es `null` cuando sube a identidad. */
  businessName: string
  shortId: string | null
  /**
   * NO HAY `slotsNote`, y borrarlo fue el arreglo.
   *
   * Pintaba `${occupancy_slots} huecos` en Equipo para avisar de que un pedido
   * te comería dos sitios de la mochila. No podía funcionar: `occupancy_slots`
   * nace en 1 y solo la escribe la acción `pickup` (`advance_order`), que deja
   * el pedido en `picked_up` — y lo recogido NO es traspasable. O sea que el
   * chip solo podía salir en pedidos que no puedes pedir, y en los que sí
   * puedes valía siempre 1 y no salía nunca.
   *
   * Además el texto decía lo contrario de lo que quería decir: "2 huecos" se
   * lee como "quedan 2 libres", no como "te ocupa 2".
   *
   * Lo que de verdad bloquea un traspaso es TU carga —`apply_order_transfer`
   * suma tus pedidos activos, no el tamaño del que pides—, y eso ya lo dice el
   * indicador de mochila de la barra superior. La prevención vive ahora en el
   * botón "Solicitar pedido", que se deshabilita con el motivo.
   */
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
  /** §23. Margen tras "Pedido listo" antes de que el BORDE se encienda. */
  queueLeadMinutes: number
  /** 0139. A partir de aquí el reloj de REPARTO se pone rojo. */
  deliveryLateMinutes: number
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

/**
 * Milisegundos que faltan para que la comida esté (negativo = ya pasó), o
 * `null` si ese reloj no aplica.
 *
 * Con la comida ya recogida devuelve `null` a propósito: el reloj de cocina
 * dejó de significar nada. Ese momento tiene SU PROPIO reloj —ver
 * `deliveryElapsedMs`—, y son dos cosas distintas.
 */
function remainingMs(input: CardVMInput): number | null {
  const { order, now, variant } = input
  if (variant === 'team' || variant === 'delivered') return null
  if (order.status === 'picked_up') return null
  if (order.estimated_ready_at == null) return null
  return Date.parse(order.estimated_ready_at) - now
}

/**
 * Milisegundos que llevas con el pedido encima, o `null` si no aplica.
 *
 * EL RELOJ NO SE APAGA NUNCA. Al recoger, el contador de cocina se acaba pero
 * el cliente empieza a esperar, y eso importa: con dos o tres pedidos en la
 * mochila, cuál lleva más tiempo rodando es exactamente lo que decide a quién
 * entregar primero.
 *
 * SE PONE ROJO A LOS `deliveryLateMinutes` (0139, 20 por defecto). Nació sin
 * alarma a propósito, porque `app_settings.timers` no definía ningún umbral de
 * entrega tardía y ponerlo rojo a ojo habría sido fabricar una regla de negocio
 * que nadie había decidido. Ya está decidida, y vive donde se puede cambiar sin
 * desplegar — igual que `queueLeadMinutes`.
 */
function deliveryElapsedMs(input: CardVMInput): number | null {
  const { order, now, variant } = input
  // También en `team`, donde no decide un traspaso —lo recogido no es
  // traspasable— sino que da conciencia de situación: cuánto lleva rodando lo
  // que carga el compañero.
  if (variant !== 'mine' && variant !== 'team') return null
  if (order.status !== 'picked_up') return null
  if (order.picked_up_at == null) return null
  return now - Date.parse(order.picked_up_at)
}

/**
 * Edad del pedido ajeno, o `null` si no aplica. SOLO en Equipo.
 *
 * NINGUNA TARJETA DE LA APP SE QUEDA SIN RELOJ, y Equipo era la excepción. Las
 * de "En reparto" ya cuentan desde que el compañero recogió; estas —"Voy al
 * local" y "En el local", las que SÍ puedes pedir— no tenían anclaje porque el
 * tiempo de cocina de un pedido ajeno no viaja, y no va a viajar:
 * `estimated_ready_at` permitiría quedarse con lo ya listo y dejarle lo lento
 * al compañero.
 *
 * `created_at` sí es honesto aquí. No dice cuándo estará la comida, dice cuánto
 * lleva esperando el cliente — que es la razón legítima para pedir un traspaso,
 * y la que además empuja en la dirección correcta: un pedido viejo suele serlo
 * porque la cocina va lenta.
 *
 * EN NEGRO Y SIN UMBRAL, como el de reparto: la urgencia de un pedido ajeno ya
 * la marca `urgent_since` en el borde de la tarjeta. Un segundo canal de alarma
 * para el mismo hecho enseña a ignorar los dos.
 */
function teamAgeMs(input: CardVMInput): number | null {
  const { order, now, variant } = input
  if (variant !== 'team') return null
  if (order.status === 'picked_up') return null
  return now - Date.parse(order.created_at)
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
 * DOS ESTADOS Y NO TRES: negro mientras queda tiempo, rojo en cuanto se pasa.
 *
 * Tenía un escalón ámbar intermedio —pasado de cero pero dentro del margen de
 * cola— y se quitó por dos razones:
 *
 *   1. EL NÚMERO YA LLEVA EL GRADO. `00:45` y `14:20` dicen solos cuánto va de
 *      retraso, así que el color no tiene que codificar cuánto: le basta con
 *      decir SI. Reservarlo para el hecho lo hace inequívoco.
 *
 *   2. EL ÁMBAR CODIFICABA UN UMBRAL QUE EL MOTORIZADO NO CONOCE.
 *      `queueLeadMinutes` es un parámetro de operación; que el reloj cambiara
 *      de color al cruzarlo le pedía interpretar una regla que nadie le ha
 *      contado. Un color que no se puede interpretar se termina ignorando.
 *
 * El margen SIGUE existiendo, pero donde sí se puede leer sin conocerlo: mueve
 * el borde de la tarjeta, que solo se enciende cuando la demora ya es seria.
 */
function buildClock(input: CardVMInput): Clock | null {
  const { order, variant } = input

  if (variant === 'delivered') {
    return order.delivered_at
      ? { text: hourOf(order.delivered_at), tone: 'neutral', ready: false }
      : null
  }

  // Con la comida encima manda el reloj de reparto: cuenta hacia arriba y se
  // pone rojo pasados `deliveryLateMinutes` (0139).
  //
  // SOLO EN "MÍOS". En Equipo el pedido es de otro: enrojecerle a uno el reloj
  // por un retraso que no puede resolver —lo recogido no es traspasable— sería
  // alarmar sin salida. Ahí el número informa y nada más.
  const delivering = deliveryElapsedMs(input)
  if (delivering != null) {
    const late = variant === 'mine' && delivering > input.deliveryLateMinutes * 60_000
    return { text: mmss(delivering / 1000), tone: late ? 'danger' : 'neutral', ready: false }
  }

  // Equipo, sin recoger: la edad del pedido. Ver `teamAgeMs`.
  const age = teamAgeMs(input)
  if (age != null) {
    return { text: mmss(age / 1000), tone: 'neutral', ready: false }
  }

  const ms = remainingMs(input)
  if (ms == null) return null

  // La marca de comida lista SOLO aquí cuando el estado no puede decirla, o sea
  // con el pedido ya tomado. Sin motorizado, `ready` deja el status en
  // `waiting_driver` y la insignia ya pone "Lista": repetirlo sería decirlo dos
  // veces en la misma tarjeta.
  const ready = variant === 'mine' && Boolean(order.ready_early_used)

  return {
    text: mmss(Math.abs(ms) / 1000),
    tone: ms >= 0 ? 'neutral' : 'danger',
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

  if (variant === 'delivered' && order.delivered_at == null) return null

  // Equipo habla en tercera persona: el nombre de la tarjeta es el del
  // compañero, no el del cliente.
  return orderStateBadge(order.status, variant === 'team')
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
 * EL BORDE ES EL SEGUNDO ESCALÓN, NO UNA COPIA DEL RELOJ.
 *
 * El reloj se pone rojo en cuanto se pasa de cero: eso es "vas tarde". El borde
 * espera a que la demora cruce `queueLeadMinutes`: eso es "esto ya no da más".
 * Dos canales, cada uno binario, con umbrales distintos — y así el margen de
 * cola sigue vivo sin obligar al motorizado a interpretarlo, porque una tarjeta
 * enmarcada en rojo se entiende sin saber cuántos minutos son.
 *
 * Si el borde se encendiera al mismo tiempo que el reloj, cualquier pedido que
 * acabara de cruzar el cero quedaría igual de gritón que uno de veinte minutos,
 * y se volvería a perder el "atiende ESTE".
 *
 * La insignia NO lo mueve: es el ESTADO del pedido, y un estado es un hecho, no
 * una alarma.
 */
function buildTone(input: CardVMInput): Tone {
  const { variant } = input

  if (variant === 'delivered' || variant === 'team') return 'neutral'

  const ms = remainingMs(input)
  if (ms == null || ms >= 0) return 'neutral'

  // Encendido o apagado, nada intermedio: por debajo del margen el borde no se
  // enciende, y decirlo `neutral` en vez de `warning` evita que el modelo
  // prometa un color que el componente no pinta.
  return escalation(input, ms) === 'danger' ? 'danger' : 'neutral'
}

/**
 * La línea de cobro. La REGLA vive en `presentation.ts`, compartida con el
 * detalle; aquí solo se adapta la fila de `orders` (snake_case) y se decide lo
 * que es propio de la bandeja.
 *
 * EL VUELTO APARECE TAMBIÉN EN "EN ESPERA": si no llevas sencillo encima, un
 * pedido que paga con billete grande es un problema que prefieres ver antes de
 * aceptarlo y no en la puerta del cliente. En el historial no, que ahí ya se dio.
 */
function buildMoney(input: CardVMInput): MoneyLine | null {
  const { order, variant } = input
  const total = order.order_amount + order.delivery_fee

  // De un pedido ajeno el cobro no viaja. Solo el importe, para decidir si
  // pides el traspaso.
  if (variant === 'team') {
    return { headline: soles(total), detail: 'importe del pedido', tone: 'neutral' }
  }

  return moneyLine({
    paymentIntent: order.payment_intent,
    // Una vez entregado manda lo que PASÓ, no lo que se planeó: si el cliente
    // cambió de método en la puerta, el historial tiene que decir eso.
    paymentReal: variant === 'delivered' ? order.payment_real : null,
    total,
    cashAmount: order.cash_amount,
    yapeAmount: order.yape_amount,
    clientPaysWith: order.client_pays_with,
    changeToGive: order.change_to_give,
    settled: variant === 'delivered',
  })
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
    clock,
    identity,
    identityIcon: isTeam ? 'directions_bike' : null,
    badge,
    reference: order.delivery_reference ?? order.delivery_address,
    money: blocked && blockedReason ? null : buildMoney(input),
    blockedReason: blocked && blockedReason ? blockedReason : null,
    tone: buildTone(input),
    interactive: !blocked && !isTeam,
    muted: Boolean(blocked),
    showSourceChip: order.source === 'customer_pwa',
  }
}
