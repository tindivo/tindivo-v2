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
// NO ES LO MISMO QUE LA COLUMNA "NUEVOS". `getColumn` mete también
// `awaiting_payment` en `nuevos`, y ahí está bien: el pedido es nuevo y merece
// verse. Pero en `awaiting_payment` la pelota la tiene el CLIENTE —le toca pagar
// y subir la captura—, así que la cajera no tiene nada que hacer y no se la
// despierta. Son dos preguntas distintas ("¿es nuevo?" y "¿me toca a mí?") y
// conviene que sigan siendo dos funciones distintas.

import type { OrderVM } from './view-model'

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

/**
 * Los dos hechos que tienen que ir juntos: si la alarma suena, hay banner.
 *
 * `hasPending` y `pendingCount` son literalmente lo que consume
 * `useDashboardSounds`; `banner` es literalmente lo que pinta `AttentionBanner`.
 * Salen de la misma llamada a propósito — ver la cabecera del módulo.
 */
export interface AttentionState {
  /** Los pedidos que reclaman a la cajera AHORA MISMO. */
  orders: OrderVM[]
  hasPending: boolean
  pendingCount: number
  /** `null` exactamente cuando `hasPending` es `false`. Eso es el invariante. */
  banner: AttentionBannerVM | null
}

/**
 * Qué reclama a la cajera y cómo se le enseña.
 *
 * · `pending_acceptance` — hay que aceptarlo o rechazarlo, y el reloj corre:
 *   `app_settings.timers.acceptanceMinutes` lo cancela solo.
 * · `validando` — hay que revisar la captura del prepago (antifraude humano,
 *   `DECISIONS.md`), y también se cancela solo.
 *
 * La decisión visual vive aquí y no en el JSX —mismo patrón que
 * `buildNegociosCardVM`— porque "si suena, se ve" es una afirmación sobre dos
 * salidas a la vez, y solo se puede comprobar de verdad si las dos son
 * llamables desde un test. Un invariante que cuesta comprobar es un invariante
 * que se deja de comprobar.
 */
export function attentionState(vms: readonly OrderVM[]): AttentionState {
  const orders = vms.filter((o) => o.status === 'pending_acceptance' || o.status === 'validando')

  if (orders.length === 0) {
    return { orders, hasPending: false, pendingCount: 0, banner: null }
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
    hasPending: true,
    pendingCount: orders.length,
    banner: {
      label,
      countdownSec: target.countdownSec,
      countdownText: fmtCountdown(target.countdownSec),
      target,
    },
  }
}

/** `mm:ss` de lo que queda, con `00:00` como suelo (el cron lo mata en breve). */
function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
