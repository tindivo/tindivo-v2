'use client'

import { useSyncExternalStore } from 'react'

/**
 * Reloj compartido para timers/countdowns.
 *
 * UN SOLO `setInterval` POR CADENCIA, no uno por consumidor. Antes cada llamada
 * a `useNow()` montaba su propio intervalo con su propia fase, así que dos
 * countdowns de la misma solicitud podían ir hasta 1s desfasados. Eso importa
 * desde que la cuenta atrás de un traspaso se pinta en DOS sitios a la vez —el
 * banner global (`TransferWatcher`, montado en `app/layout.tsx`) y la card de
 * "Míos"—, que además viven en árboles hermanos y no pueden compartir un `now`
 * por props.
 *
 * Con el ticker compartido los dos leen el MISMO número en el mismo frame,
 * porque leen literalmente el mismo valor.
 */

interface Ticker {
  now: number
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | null
}

/** Un ticker por cadencia. `useNow(1000)` y `useNow(30000)` no se pisan. */
const tickers = new Map<number, Ticker>()

function tickerFor(intervalMs: number): Ticker {
  let ticker = tickers.get(intervalMs)
  if (!ticker) {
    ticker = { now: Date.now(), listeners: new Set(), timer: null }
    tickers.set(intervalMs, ticker)
  }
  return ticker
}

function subscribe(intervalMs: number, onChange: () => void): () => void {
  const ticker = tickerFor(intervalMs)
  ticker.listeners.add(onChange)

  if (ticker.timer === null) {
    ticker.timer = setInterval(() => {
      ticker.now = Date.now()
      for (const listener of ticker.listeners) listener()
    }, intervalMs)
  }

  return () => {
    ticker.listeners.delete(onChange)
    // Sin suscriptores no hay a quién avisar: parar el intervalo evita dejar
    // un timer vivo por cada cadencia que se usó alguna vez.
    if (ticker.listeners.size === 0 && ticker.timer !== null) {
      clearInterval(ticker.timer)
      ticker.timer = null
    }
  }
}

/**
 * Milisegundos actuales, re-renderizando cada `intervalMs`.
 *
 * `useSyncExternalStore` en vez de `useState` + `useEffect`: garantiza que todos
 * los suscriptores de la misma cadencia vean el mismo valor en el mismo render,
 * que es la propiedad que se necesita aquí.
 */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (onChange) => subscribe(intervalMs, onChange),
    () => tickerFor(intervalMs).now,
    // MISMA función en servidor, y a propósito. `getServerSnapshot` tiene que
    // devolver un valor ESTABLE entre llamadas —un `Date.now()` fresco en cada
    // lectura haría que React no converja—, y el `now` del ticker lo es
    // mientras no haya intervalo corriendo, que es justo el caso en servidor.
    //
    // Que pueda ser un timestamp viejo no llega a pintarse: todo lo que usa
    // este reloj vive detrás de la compuerta de sesión de `(driver)/layout.tsx`,
    // que devuelve `LoadingState` hasta que `getSession()` resuelve en cliente.
    () => tickerFor(intervalMs).now,
  )
}
