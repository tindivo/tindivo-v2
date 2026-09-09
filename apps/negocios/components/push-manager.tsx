'use client'

import { registerServiceWorker } from '@tindivo/ui'
import { useEffect } from 'react'
import { usePushStatus } from '@/hooks/use-push-status'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Registra el service worker (instalabilidad) y REPARA la suscripción cuando el
 * permiso ya está concedido pero el token no está registrado.
 *
 * QUÉ HACÍA ANTES Y POR QUÉ ERA UN PROBLEMA. Este componente era el ÚNICO que
 * mandaba el token al backend, y decidía si hacerlo mirando el permiso una sola
 * vez, al montar. Como el gate de alertas concede el permiso DESPUÉS de ese
 * montaje, el caso normal —la cajera entra, sale el gate, lo acepta— terminaba
 * con permiso concedido y sin suscripción. Además enseñaba un botón flotante
 * propio, «🔔 Activar avisos», que era un segundo sitio donde activar lo mismo:
 * quien tocaba el del gate se quedaba sin token, y quien tocaba este se
 * saltaba la prueba de sonido.
 *
 * Ahora hay UN solo camino para activar —el gate y Config, los dos vía
 * `usePushStatus`— y esto se queda con el trabajo que sí es suyo: registrar el
 * SW y volver a suscribir cuando el navegador rota o revoca el token, que pasa
 * solo y en silencio.
 */
export function PushManager() {
  const { status, enable } = usePushStatus()

  useEffect(() => {
    void registerServiceWorker()
  }, [])

  useEffect(() => {
    // `granted` sin suscripción viva = el navegador la rotó o la revocó. Se
    // repara sin preguntar nada: el permiso ya está dado, así que no hace falta
    // gesto del usuario y no hay nada que consultarle.
    if (status !== 'granted') return
    let cancelado = false
    void (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession()
      if (cancelado || !data.session) return
      await enable()
    })()
    return () => {
      cancelado = true
    }
  }, [status, enable])

  return null
}
