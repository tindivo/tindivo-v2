'use client'

import { api } from '@/lib/api'

/**
 * URLs firmadas del comprobante, memorizadas por pedido.
 *
 * POR QUÉ EXISTE. `createSignedUrl` firma un token NUEVO en cada llamada —el
 * `exp` se mueve—, así que la URL cambiaba en cada apertura de la ficha. El
 * comprobante se sube con `Cache-Control: max-age=31536000`, pero ese año no
 * servía de nada: con la query distinta, el navegador nunca acertaba y la
 * cajera se volvía a bajar los ~100 KB cada vez que abría el MISMO pedido. Y lo
 * abre varias veces: a mirarlo, a aceptarlo, a comprobarlo otra vez.
 *
 * Reusando la URL mientras siga viva, la segunda apertura la sirve el caché del
 * navegador y la imagen aparece pintada.
 *
 * En memoria y no en `sessionStorage` a propósito: es una credencial de lectura
 * con caducidad sobre el comprobante de pago de un cliente, y no tiene por qué
 * sobrevivir a la pestaña.
 */

interface Entry {
  url: string | null
  /** Epoch ms a partir del cual dejamos de fiarnos de la firma. */
  goodUntil: number
  /** Petición en vuelo: dos aperturas seguidas comparten una sola. */
  inflight?: Promise<string | null>
}

const cache = new Map<string, Entry>()

/**
 * El servidor firma para 10 minutos y aquí descontamos uno.
 *
 * El margen no es cosmético: la imagen tarda en bajar, y una URL que caduca a
 * mitad de la descarga devuelve un 400 que en pantalla es un comprobante roto
 * sin explicación.
 */
const TTL_MS = 9 * 60_000

function key(orderId: string, path: string): string {
  return `${orderId}::${path}`
}

/** URL firmada del comprobante, del caché si sigue viva. */
export function getProofUrl(orderId: string, path: string): Promise<string | null> {
  const k = key(orderId, path)
  const hit = cache.get(k)
  if (hit?.inflight) return hit.inflight
  if (hit && Date.now() < hit.goodUntil) return Promise.resolve(hit.url)

  const inflight = api
    .get<{ data: { url: string | null } }>(`/business/orders/${orderId}/prepay-proof`)
    .then((r) => {
      cache.set(k, { url: r.data.url, goodUntil: Date.now() + TTL_MS })
      return r.data.url
    })
    .catch((err) => {
      // Un fallo no se cachea: la siguiente apertura vuelve a intentarlo.
      cache.delete(k)
      throw err
    })

  cache.set(k, { url: null, goodUntil: 0, inflight })
  return inflight
}

/**
 * Calienta el caché sin que a nadie le importe el resultado.
 *
 * Se dispara al APRETAR la tarjeta, no al soltarla: entre el `pointerdown` y el
 * `click` que abre la ficha hay unas decenas de milisegundos regalados, y con
 * ellos la petición ya va en camino cuando la ficha monta.
 */
export function prefetchProofUrl(orderId: string, path: string | null): void {
  if (!path) return
  void getProofUrl(orderId, path).catch(() => {
    /* el prefetch es opcional por definición; la ficha reintenta */
  })
}
