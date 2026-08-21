'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { alertFor, type TrackingAlert, trackingSignal } from '@/features/tracking/lib/alerts'
import { playChime, unlockChimes, VIBRACION } from '@/features/tracking/lib/chime'
import type { Tracking } from '@/features/tracking/types'

const CLAVE = 'tindivo:tracking-alerts'

export interface StatusAlerts {
  /** El aviso recién ocurrido, para pintar el toast. `null` cuando se cierra. */
  alerta: TrackingAlert | null
  descartar: () => void
  sonidoActivo: boolean
  alternarSonido: () => void
}

/**
 * Avisa al cliente cuando su pedido cambia, con la pantalla abierta.
 *
 * Complementa al push (`components/push-manager.tsx` + `public/sw.js`), que
 * cubre el caso contrario: la app cerrada. Por eso el sonido solo suena con la
 * pestaña visible — si está en segundo plano el push ya se encarga, y hacer las
 * dos cosas es avisar dos veces del mismo hecho.
 *
 * Tres canales, porque ninguno funciona siempre:
 *
 *   · SONIDO. Necesita un gesto previo del usuario o el navegador lo bloquea, y
 *     con la pestaña oculta muchos navegadores lo silencian igual.
 *   · VIBRACIÓN. Va en Android, no en iOS.
 *   · TÍTULO DE LA PESTAÑA. Es el único que se ve con la app en segundo plano
 *     sin depender de permisos, y por eso es el que NO es opcional.
 *
 * **Nunca avisa en la primera lectura.** El primer `data` que llega no es un
 * cambio: es el estado en que ya estaba. Sin esta guarda, abrir el seguimiento
 * de un pedido en camino pitaría cada vez, y volver de la billetera de Yape a
 * la pestaña también.
 */
export function useStatusAlerts(data: Tracking | null): StatusAlerts {
  const [sonidoActivo, setSonidoActivo] = useState(true)
  const [alerta, setAlerta] = useState<TrackingAlert | null>(null)
  const previa = useRef<string | null>(null)
  const tituloOriginal = useRef<string | null>(null)
  const sonidoRef = useRef(true)

  // Preferencia persistida. Se lee en efecto y no en el `useState` inicial para
  // que el HTML del servidor y el del cliente coincidan en el primer render.
  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE)
    const activo = guardado !== 'off'
    setSonidoActivo(activo)
    sonidoRef.current = activo
  }, [])

  // Desbloqueo del audio en el primer toque de la página. `once` y en captura:
  // basta con que el dedo roce cualquier cosa, incluido un scroll que empieza
  // con un `pointerdown`.
  useEffect(() => {
    const abrir = () => unlockChimes()
    document.addEventListener('pointerdown', abrir, { once: true, capture: true })
    return () => document.removeEventListener('pointerdown', abrir, { capture: true })
  }, [])

  const alternarSonido = useCallback(() => {
    setSonidoActivo((antes) => {
      const ahora = !antes
      sonidoRef.current = ahora
      window.localStorage.setItem(CLAVE, ahora ? 'on' : 'off')
      // Encenderlo ES un gesto del usuario: el mejor momento para desbloquear el
      // audio si el cliente aún no había tocado nada.
      if (ahora) unlockChimes()
      return ahora
    })
  }, [])

  useEffect(() => {
    if (!data) return
    const signal = trackingSignal(data)

    if (previa.current === null) {
      previa.current = signal
      return
    }
    if (previa.current === signal) return
    previa.current = signal

    const aviso = alertFor(signal, data.paymentIntent === 'prepaid')
    if (!aviso) return

    setAlerta(aviso)

    const visible = document.visibilityState === 'visible'
    if (visible && sonidoRef.current) playChime(aviso.tone)
    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(VIBRACION[aviso.tone])
      } catch {
        // Algunos navegadores lanzan si la pestaña no está visible. Da igual.
      }
    }
    if (!visible) {
      tituloOriginal.current ??= document.title
      document.title = `🔔 ${aviso.message}`
    }
  }, [data])

  // El título vuelve a su sitio en cuanto el cliente mira la pestaña.
  useEffect(() => {
    const restaurar = () => {
      if (document.visibilityState === 'visible' && tituloOriginal.current !== null) {
        document.title = tituloOriginal.current
        tituloOriginal.current = null
      }
    }
    document.addEventListener('visibilitychange', restaurar)
    return () => {
      document.removeEventListener('visibilitychange', restaurar)
      if (tituloOriginal.current !== null) document.title = tituloOriginal.current
    }
  }, [])

  const descartar = useCallback(() => setAlerta(null), [])

  return { alerta, descartar, sonidoActivo, alternarSonido }
}
