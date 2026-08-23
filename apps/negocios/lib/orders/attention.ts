// EL INVARIANTE: SI SUENA, SE VE.
//
// Este módulo existe por un pedido perdido en producción. `JMAXL98Z` (Pizza
// Priamo, 21-ago) nació a las 19:38, sonó cinco minutos —bip cada 3s y voz cada
// 15s— y se autocanceló a las 19:43 sin que nadie lo tocara. La cajera no estaba
// ausente: estaba tecleando un pedido manual en `/nuevo`, y lo envió 18 segundos
// después de que el pedido web muriera.
//
// La causa no fue el sonido ni los datos. El pedido estaba cargado y contado. Lo
// que fallaba era el REPARTO de esos dos hechos entre dos sitios distintos:
//
//   · el sonido vivía en el chrome, que persiste en el layout → sonaba en todas
//     las rutas, cinco minutos seguidos;
//   · las tarjetas vivían solo en `app/page.tsx` → en `/nuevo` no había ninguna.
//
// Y los dos avisos visuales que sí eran globales duraban mucho menos que la
// alarma: un toast de SEIS SEGUNDOS y una píldora pequeña en el sidebar. El
// sonido duraba cinco minutos. Esa asimetría es todo el fallo.
//
// La lección no es "añadir un aviso más". Es que la condición que hace SONAR y
// la condición que hace VER tienen que salir de LA MISMA LLAMADA, o vuelven a
// separarse en cuanto alguien toque una de las dos. Por eso `attentionState`
// devuelve los dos hechos juntos en un objeto: no hay forma de encender la
// alarma sin traerse el banner en la misma expresión.
//
// LA OTRA MITAD, QUE LLEGÓ DESPUÉS: LO QUE SUENA ES UN SUBCONJUNTO DE LO QUE SE
// VE, NO LO MISMO.
//
// El invariante de arriba impide que suene algo invisible. No dice nada del
// camino contrario, y ahí estaba el otro problema: el sonido no sabía cuándo
// parar. Su única entrada era "¿hay pendientes?", así que un pedido pitaba cada
// tres segundos durante sus cinco minutos —unos cien bips dobles y veinte
// frases habladas— y seguía pitando MIENTRAS la cajera lo tenía abierto
// delante. Del piloto volvió una sola queja sobre esto, y es la peor que puede
// volver: que suena demasiado. Porque la respuesta natural a una alarma
// insoportable es apagarla, y el interruptor que existe se guarda para siempre.
//
// El trabajo de la alarma es IR A BUSCARLA. Cuando la ha traído, se calla.
// Abrir el pedido es el acuse de recibo (`acknowledged`): apaga el sonido de
// ESE pedido y no toca nada de lo visible —el banner y el latido siguen—.
// Por eso `AttentionState` tiene dos campos y no uno: `orders`/`banner` es lo
// que se ve, y `alarm` es lo que suena, que sale de filtrar el primero.
//
// NO ES LO MISMO QUE LA COLUMNA "NUEVOS". `getColumn` mete también
// `awaiting_payment` en `nuevos`, y ahí está bien: el pedido es nuevo y merece
// verse. Pero en `awaiting_payment` la pelota la tiene el CLIENTE —le toca pagar
// y subir la captura—, así que la cajera no tiene nada que hacer y no se la
// despierta. Son dos preguntas distintas ("¿es nuevo?" y "¿me toca a mí?") y
// conviene que sigan siendo dos funciones distintas.

import type { OrderVM } from './view-model'

/** Sin acuses: el caso de quien llama a `attentionState` sin pasar nada. */
const SIN_ACUSES: ReadonlySet<string> = new Set()

/** Lo que el banner necesita pintar, ya decidido. Ver `attentionState`. */
export interface AttentionBannerVM {
  /** Texto principal: el pedido concreto si hay uno, el recuento si hay varios. */
  label: string
  /** Segundos que le quedan al MÁS urgente. */
  countdownSec: number
  /** `countdownSec` en `mm:ss`, con `00:00` como suelo. */
  countdownText: string
  /** El pedido que se abre al pulsar: siempre el más urgente. */
  target: OrderVM
}

/** Lo que suena. Es siempre un subconjunto de lo que se ve. */
export interface AlarmState {
  /** Los que reclaman a la cajera y todavía no ha acusado. */
  orders: OrderVM[]
  hasPending: boolean
  count: number
  /**
   * Alguno está en su último minuto. Ese ya no admite acuse y además aprieta la
   * cadencia del bip: ver `nextBeepDelay`.
   */
  urgent: boolean
}

/**
 * Los hechos que tienen que ir juntos, en una sola llamada.
 *
 * `banner` es literalmente lo que pinta `AttentionBanner`; `orders` es lo que
 * hace latir las tarjetas; `alarm` es literalmente lo que consume
 * `useDashboardSounds`. Salen de aquí a la vez a propósito — ver la cabecera del
 * módulo.
 */
export interface AttentionState {
  /** Los pedidos que reclaman a la cajera AHORA MISMO, haya acusado o no. */
  orders: OrderVM[]
  /** `null` exactamente cuando `orders` está vacío. Eso es el invariante. */
  banner: AttentionBannerVM | null
  /** Lo que suena: `orders` menos lo acusado. Nunca más que `orders`. */
  alarm: AlarmState
}

/**
 * EL ÚLTIMO MINUTO.
 *
 * Un solo número para «esto se acaba»: lo usan el reloj de la tarjeta (que se
 * pone rojo), el borde, el latido urgente y la alarma, que a partir de aquí ya
 * no se deja acallar. Estaban los cuatro escritos como un `60` suelto en sitios
 * distintos, que es como empiezan a separarse.
 */
export const LAST_CALL_SEC = 60

/**
 * LA CLAVE DEL ACUSE DE RECIBO: EL PEDIDO **Y** SU SITUACIÓN.
 *
 * Que lleve el estado dentro no es un detalle de implementación, es la regla:
 * el acuse vale para lo que la cajera vio, no para el pedido de por vida. Un
 * prepago que aceptó (y con eso calló) vuelve a sonar solo cuando el cliente
 * sube el comprobante y pasa a `validando` — porque es OTRA clave, y de esa no
 * hay acuse. El ida y vuelta sale del modelo, sin lógica que lo vigile.
 */
export function attentionKey(o: Pick<OrderVM, 'rowId' | 'status'>): string {
  return `${o.rowId}:${o.status}`
}

/**
 * ¿LE TOCA A LA CAJERA, AHORA MISMO?
 *
 * Es LA pregunta, y tiene un solo sitio donde contestarse. La responden a la
 * vez el sonido, el banner de `attentionState` y el latido de la tarjeta
 * (`buildNegociosCardVM`, campo `pulse`): tres superficies, un predicado. Si
 * cada una se escribiera su propia condición, volveríamos a la asimetría que
 * perdió a `JMAXL98Z` —sonaba una cosa y se veía otra— solo que repartida entre
 * más sitios.
 *
 * El recorrido del pedido, visto desde aquí:
 *
 *   · `pending_acceptance` → SÍ. Hay que aceptarlo o rechazarlo, y el reloj corre.
 *   · `awaiting_payment`   → NO. Aceptado y esperando al cliente, que es quien
 *                            tiene que pagar y subir la captura. Despertarla
 *                            aquí es alarma sin nada que hacer.
 *   · `validando`          → SÍ, otra vez. Ya llegó la captura y toca mirarla
 *                            (antifraude humano), o toca validar el riesgo.
 *   · contraentrega        → al aceptar se va a cocina y no vuelve a reclamar.
 *
 * Ese ida y vuelta —reclama, se calma, vuelve a reclamar— es intencionado: lo
 * que distingue una señal de un adorno es que se apague cuando no hace falta.
 */
export function demandsCashier(o: Pick<OrderVM, 'status'>): boolean {
  return o.status === 'pending_acceptance' || o.status === 'validando'
}

/**
 * LO QUE DICE LA CABECERA DE «NUEVOS», QUE NO ES LO QUE CUENTA SU CHIP.
 *
 * El chip cuenta la columna entera —es lo que promete la palabra «Nuevos»— y ahí
 * caben pedidos que no son cosa suya: un prepago aceptado esperando a que el
 * cliente pague sigue siendo nuevo. Con el chip en rojo marcando 4, la cajera
 * lee cuatro cosas por hacer cuando puede que solo dos lo sean.
 *
 * El subtítulo reparte ese número. Decía «Revisar antes de aceptar», que es una
 * instrucción y siempre la misma; ahora dice cuántos la esperan a ella y cuántos
 * esperan al cliente, y sale del mismo predicado que ordena la columna, enciende
 * el sonido y hace latir la tarjeta.
 */
export function newColumnSubtitle(nuevos: readonly OrderVM[]): string {
  const mios = nuevos.filter(demandsCashier).length
  const suyos = nuevos.length - mios

  if (mios === 0 && suyos === 0) return 'Revisar antes de aceptar'

  const parteMia = mios === 1 ? '1 te espera' : `${mios} te esperan`
  const parteSuya = suyos === 1 ? '1 esperando al cliente' : `${suyos} esperando al cliente`

  if (mios === 0) return parteSuya
  if (suyos === 0) return parteMia
  return `${parteMia} · ${parteSuya}`
}

/**
 * EL ORDEN DE LA COLUMNA «NUEVOS»: PRIMERO EL QUE SE MUERE ANTES.
 *
 * La columna salía en el orden en que la llegaban las filas, y la consulta pide
 * `created_at DESC` (`chrome.tsx`): o sea el pedido MÁS RECIENTE arriba y el que
 * está a punto de autocancelarse ABAJO, justo al revés de lo que hay que
 * atender. Con cuatro tarjetas y una columna que scrollea, al que le quedan
 * treinta segundos podía no verse sin bajar.
 *
 * Dos criterios, en este orden:
 *
 *   1. Quién tiene la pelota (`demandsCashier`). Un `awaiting_payment` nunca se
 *      pone por delante de algo que ella tiene que atender, por muy poco tiempo
 *      que le quede: ese reloj lo corre el cliente.
 *   2. Dentro de cada grupo, el que menos tiempo tiene. No el más antiguo: un
 *      `pending_acceptance` (5 min) y un `validando` de prepago (10 min) no
 *      caducan al mismo ritmo, y el que llegó después puede morirse antes. Es el
 *      mismo criterio con el que `attentionState` elige a quién apunta el
 *      banner, y conviene que la primera tarjeta de la columna sea esa misma.
 *
 * VIVE AQUÍ Y NO JUNTO A `sortCooking` (en `view-model.ts`) porque necesita el
 * predicado, y `view-model` es la capa de abajo: hacerla importar de aquí
 * invertiría las capas para ahorrarse un fichero.
 */
export function sortNew(a: OrderVM, b: OrderVM): number {
  const mia = Number(demandsCashier(b)) - Number(demandsCashier(a))
  return mia !== 0 ? mia : a.countdownSec - b.countdownSec
}

/**
 * CADA CUÁNTO PITA, QUE NO ES SIEMPRE LO MISMO.
 *
 * Pitaba cada 3 segundos de principio a fin. Los tres primeros segundos son
 * para que levante la cabeza; los tres minutos siguientes al mismo ritmo ya no
 * informan de nada nuevo y solo enseñan a odiar el aviso.
 *
 *   · TANDA DE ENGANCHE (`INSIST_MS`): rápido, hasta media docena de bips. Es
 *     lo que hace falta para sacarla de una comanda a medio teclear.
 *   · LUEGO: espaciado. El pedido sigue ahí, latiendo y con su banner; el bip
 *     solo mantiene la presencia, no repite la noticia.
 *   · ÚLTIMO MINUTO (`urgent`): vuelve al ritmo rápido, y ahí ya no hay acuse
 *     que valga. Si suena otra vez es que se acaba el tiempo, y esa es la frase
 *     entera que hay que explicarle a la cajera.
 *
 * Es una función pura del tiempo transcurrido para poder comprobarla sin
 * relojes ni temporizadores: el hook solo la consulta.
 */
export const BEEP_FAST_MS = 3_000
export const BEEP_SLOW_MS = 12_000
export const INSIST_MS = 30_000

export function nextBeepDelay({
  elapsedMs,
  urgent,
}: {
  /** Desde que esta tanda empezó a sonar. */
  elapsedMs: number
  urgent: boolean
}): number {
  return urgent || elapsedMs < INSIST_MS ? BEEP_FAST_MS : BEEP_SLOW_MS
}

/**
 * CADA CUÁNTO HABLA.
 *
 * La voz iba cada 15 segundos, o sea unas veinte veces por pedido. Y la voz es
 * lo que más estorba de todo el aviso: la cajera está al teléfono con el
 * cliente y la tablet le habla por encima. Dice menos que el bip —el mismo
 * recuento que ya está en el banner— y cuesta más.
 *
 * Se queda en el flanco: habla cuando la cuenta SUBE, que es cuando hay noticia,
 * y como mucho una vez por minuto mientras siga sin acusarse.
 */
export const VOICE_EVERY_MS = 60_000

/**
 * Qué reclama a la cajera y cómo se le enseña.
 *
 * Qué entra lo decide `demandsCashier`; aquí solo se ordena y se redacta. Los
 * dos estados que entran comparten lo que importa: hay algo que hacer y hay un
 * reloj que los cancela solo si no se hace.
 *
 * La decisión visual vive aquí y no en el JSX —mismo patrón que
 * `buildNegociosCardVM`— porque "si suena, se ve" es una afirmación sobre dos
 * salidas a la vez, y solo se puede comprobar de verdad si las dos son
 * llamables desde un test. Un invariante que cuesta comprobar es un invariante
 * que se deja de comprobar.
 */
export function attentionState(
  vms: readonly OrderVM[],
  /**
   * Claves de `attentionKey` que la cajera ya acusó abriendo el pedido. Solo
   * callan el sonido; lo visible no se toca.
   */
  acknowledged: ReadonlySet<string> = SIN_ACUSES,
): AttentionState {
  const orders = vms.filter(demandsCashier)

  // El acuse no sirve en el último minuto: a esas alturas el pedido está a
  // punto de autocancelarse solo, y «ya lo vi» hace tres minutos no es una
  // razón para dejarlo morir callado. Así se perdió `JMAXL98Z`.
  const sonando = orders.filter(
    (o) => o.countdownSec < LAST_CALL_SEC || !acknowledged.has(attentionKey(o)),
  )
  const alarm: AlarmState = {
    orders: sonando,
    hasPending: sonando.length > 0,
    count: sonando.length,
    urgent: sonando.some((o) => o.countdownSec < LAST_CALL_SEC),
  }

  if (orders.length === 0) {
    return { orders, banner: null, alarm }
  }

  // El MÁS URGENTE manda el reloj: es el que se cancela primero, y es el número
  // que decide si a la cajera le da tiempo. Ordenar por lo que queda y no por
  // antigüedad los distingue cuando conviven un `pending_acceptance` (5 min) y
  // un `validando` de prepago (10 min).
  const target = [...orders].sort((a, b) => a.countdownSec - b.countdownSec)[0] as OrderVM

  const label =
    orders.length > 1
      ? `${orders.length} pedidos requieren tu atención`
      : target.status === 'validando'
        ? `Pedido #${target.id} · revisa el pago`
        : `Pedido nuevo #${target.id} · acéptalo`

  return {
    orders,
    banner: {
      label,
      countdownSec: target.countdownSec,
      countdownText: fmtCountdown(target.countdownSec),
      target,
    },
    alarm,
  }
}

/** `mm:ss` de lo que queda, con `00:00` como suelo (el cron lo mata en breve). */
function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
