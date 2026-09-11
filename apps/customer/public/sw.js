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
 * MANEJADOR `fetch` VACIO, Y VACIO A PROPOSITO.
 *
 * No intercepta nada: sin `respondWith`, el navegador hace la peticion como si
 * este listener no existiera. Esta aqui por el otro efecto que tiene su mera
 * presencia — Chrome ha venido exigiendo que el service worker TENGA un
 * manejador de `fetch` para considerar la app instalable y disparar
 * `beforeinstallprompt`, que es el evento del que cuelga la tarjeta de instalar.
 *
 * Sin un dispositivo real a mano no se puede confirmar que hoy siga siendo
 * requisito, pero cuesta cero y no cambia ni una peticion. Lo que NO se hace es
 * un passthrough (`respondWith(fetch(e.request))`): eso si mete al SW en medio
 * de todo el trafico —rangos, streaming, subidas— a cambio de nada.
 */
self.addEventListener('fetch', () => {})

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
