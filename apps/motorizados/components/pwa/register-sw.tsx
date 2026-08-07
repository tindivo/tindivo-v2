'use client'

import { useEffect } from 'react'

const RELOADED_KEY = 'tindivo:sw:reloaded'

/**
 * Registra el service worker. Es el ÚNICO sitio que lo hace.
 *
 * Antes vivía dentro del componente que también gestionaba la suscripción push;
 * al separarlos, esto tiene que montarse antes que cualquier cosa que dependa
 * de `serviceWorker.ready` — sin registro no hay push, no hay notificaciones y
 * no hay instalación.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // Intencional: este log es el único sitio donde nos enteramos de que el
      // SW no registró. Sin él, el motorizado se queda sin avisos en silencio.
      console.error('[pwa] sw register failed', err)
    })

    // Cuando un SW nuevo toma el control, la página sigue hablando con el
    // anterior hasta recargar. Se recarga una sola vez: el guard evita el
    // bucle si el nuevo SW vuelve a reclamar el control tras la recarga.
    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem(RELOADED_KEY)) return
        sessionStorage.setItem(RELOADED_KEY, '1')
      } catch {
        // Safari en privado lanza al escribir: sin guard preferimos NO recargar
        // antes que arriesgar un bucle de recargas.
        return
      }
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return null
}
