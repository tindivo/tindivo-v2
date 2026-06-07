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
    icon: '/icon.svg',
    badge: '/icon.svg',
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

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
