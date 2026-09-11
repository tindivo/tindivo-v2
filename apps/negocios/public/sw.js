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
    tag: data.tag || 'new-order',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: data.url || '/' },
    requireInteraction: true,
    renotify: true,
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

// Avisa a las pestañas abiertas cuando el navegador rota o revoca la
// suscripción por su cuenta. Chrome casi nunca dispara esto, pero cuando lo
// hace es la única forma de enterarse sin esperar al siguiente poll — ver el
// auto-heal de `usePushStatus`.
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
