// Tindivo service worker — push + notificationclick.
// Sin offline-sync por decisión de producto.

const DEFAULT_VIBRATE = [200, 100, 200]

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let title = 'Tindivo'
      let options = {
        body: 'Tienes una actualización',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      }

      try {
        let data = null
        if (event.data) {
          try {
            data = event.data.json()
          } catch {
            try {
              data = { title: 'Tindivo', body: event.data.text() }
            } catch {
              data = null
            }
          }
        } else {
          console.warn('[sw:push] sin event.data, notif generica')
        }

        if (data) {
          const {
            title: t,
            body = '',
            icon = '/icon-192.png',
            badge = '/icon-192.png',
            tag,
            url = '/',
            requireInteraction = false,
            silent,
            vibrate,
          } = data

          if (t) title = t

          options = {
            body,
            icon,
            badge,
            tag,
            requireInteraction: Boolean(requireInteraction),
            data: { url },
            vibrate: Array.isArray(vibrate) ? vibrate : vibrate ? DEFAULT_VIBRATE : undefined,
          }

          if (typeof silent === 'boolean') options.silent = silent

          console.log('[sw:push]', {
            tag,
            title,
            requireInteraction: options.requireInteraction,
          })
        } else {
          console.warn('[sw:push] payload no parseable')
        }
      } catch (err) {
        console.error('[sw:push] error procesando payload', err)
      }

      return self.registration.showNotification(title, options)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of list) {
        if ('focus' in client && new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client && client.url !== self.location.origin + url) {
            return client.navigate(url)
          }
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of list) {
        client.postMessage({ type: 'push-subscription-changed' })
      }
    })(),
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
