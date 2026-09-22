// Tindivo service worker — push + notificationclick (sin offline-sync, por decisión de producto).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Tindivo', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Tindivo'
  const options = {
    body: data.body || '',
    tag: data.tag,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: data.url || '/' },
    requireInteraction: Boolean(data.requireInteraction),
  }
  if (Array.isArray(data.vibrate)) options.vibrate = data.vibrate
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

/**
 * MANEJADOR `fetch`: DEJA PASAR TODO, EXCEPTO LOS TILES DEL MAPA.
 *
 * Para todo lo demas sigue sin interceptar nada: sin `respondWith`, el
 * navegador hace la peticion como si este listener no existiera. Eso es lo
 * que mantiene vivo lo que ya se habia decidido aqui — no meter el SW en
 * medio de rangos, streaming o subidas a cambio de nada. Chrome ademas exige
 * que el SW TENGA un manejador de `fetch` para considerar la app instalable
 * (`beforeinstallprompt`), asi que esta funcion cumple las dos cosas.
 *
 * LOS TILES SON LA EXCEPCION, Y CON UN MOTIVO MEDIDO. El selector de
 * ubicacion (`map-picker-inner.tsx`) pide sus tiles en vivo a CARTO y a Esri
 * — dominios ajenos, sin control de cache de Tindivo. Medido contra el stack
 * local con Chrome DevTools Protocol (CPU x4 + red rural ~1.5 Mbps/300ms,
 * simulando un Android barato en San Jacinto): 643 ms de promedio por tile,
 * hasta 1004 ms el mas lento, y eso ANTES de que el pueblo entero — area fija
 * y chica — cambie nunca de una sesion a otra. Cachearlos aqui, con TTL
 * indefinido, es la diferencia entre pagar esa latencia una vez por pueblo y
 * pagarla en cada apertura del mapa.
 *
 * CACHE-FIRST Y NO STALE-WHILE-REVALIDATE: un tile de San Jacinto no tiene
 * por que refrescarse solo porque paso el tiempo. Si CARTO o Esri actualizan
 * su render alguna vez, se resuelve subiendo `TILE_CACHE_VERSION`, no con un
 * TTL adivinado.
 */
const TILE_CACHE_VERSION = 1
const TILE_CACHE = `tindivo-tiles-v${TILE_CACHE_VERSION}`
// El cupo tope no es para acotar San Jacinto —a z14-19 el pueblo entero cabe
// muy por debajo de esto— sino una red de seguridad si algun dia se abre otro
// pueblo o un zoom mas alto: sin tope, un IndexedDB/CacheStorage que crece sin
// limite es exactamente el tipo de fuga que nadie ve hasta que el telefono de
// alguien se queda sin espacio.
const TILE_CACHE_MAX_ENTRIES = 800

function esTileDelMapa(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.hostname.endsWith('.basemaps.cartocdn.com') || u.hostname === 'server.arcgisonline.com'
}

/** Los tiles no se borran por edad, se recortan por cupo: el mas viejo insertado sale primero. */
async function recortarCache(cache) {
  const claves = await cache.keys()
  const exceso = claves.length - TILE_CACHE_MAX_ENTRIES
  if (exceso <= 0) return
  await Promise.all(claves.slice(0, exceso).map((k) => cache.delete(k)))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || !esTileDelMapa(req.url)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(TILE_CACHE)
      const enCache = await cache.match(req)
      if (enCache) return enCache
      try {
        const res = await fetch(req)
        // Los tiles de estos dominios llegan `opaque` (sin CORS, sin poder
        // leer status ni body) porque Leaflet los pide como `<img>` crudo: se
        // guardan igual, es el mismo contrato que ya cumple la cache del
        // propio navegador con ellos.
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(req, res.clone())
          event.waitUntil(recortarCache(cache))
        }
        return res
      } catch {
        // Sin red y sin nada en cache: que falle como fallaba antes de esto.
        return Response.error()
      }
    })(),
  )
})

// Avisa a las pestañas abiertas cuando el navegador rota o revoca la
// suscripción por su cuenta. Casi nunca se dispara, pero cuando lo hace es la
// única forma de enterarse sin esperar al siguiente chequeo periódico — ver
// `reengancharSiConcedido` en `lib/push.ts`.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of list) {
        client.postMessage({ type: 'push-subscription-changed' })
      }
    })(),
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
