'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const CLAVE = 'tindivo:tracking-wake-lock'

export interface WakeLock {
  /** `false` si este navegador no tiene la API. Quien lo pinte, que no lo pinte. */
  soportado: boolean
  activo: boolean
  alternar: () => void
}

type NavigatorConWakeLock = Navigator & {
  wakeLock?: { request: (tipo: 'screen') => Promise<WakeLockSentinel> }
}

/**
 * MANTENER LA PANTALLA ENCENDIDA MIENTRAS SE ESPERA EL PEDIDO.
 *
 * Es el peldaño 2 de la escalera de avisos, y existe porque el 3 no aguanta el
 * peso que aparenta: una pestaña en segundo plano se congela —el navegador
 * estrangula sus temporizadores y puede pararlos del todo—, así que «lo dejo
 * abierto esperando» no es un canal fiable. Lo que sí funciona es el caso real
 * de San Jacinto: el cliente deja el celular en la mesa, a la vista. Sin esto,
 * la pantalla se apaga a los 30 segundos y el toast y el sonido se los pierde.
 *
 * NO ES UN SUSTITUTO DEL PUSH, y por eso está apagado por defecto: gasta
 * batería y solo sirve con la app delante. Es para quien ya decidió quedarse
 * mirando.
 *
 * EL BLOQUEO SE SUELTA SOLO AL OCULTAR LA PESTAÑA, por diseño de la plataforma,
 * y NO vuelve al mostrarla. De ahí el `visibilitychange`: sin él, la primera vez
 * que el cliente mira WhatsApp y vuelve, el modo espera está silenciosamente
 * apagado aunque el interruptor siga en verde — que es peor que no tenerlo.
 *
 * La preferencia se recuerda porque es una costumbre, no una decisión por
 * pedido; quien la activó una vez espera encontrarla activada la próxima.
 * `activo` sigue siendo la INTENCIÓN del cliente, no si hay bloqueo vivo ahora
 * mismo: son cosas distintas cada vez que la pestaña se oculta, y lo que el
 * interruptor tiene que retratar es la intención.
 */
export function useWakeLock(habilitado: boolean): WakeLock {
  const [soportado, setSoportado] = useState(false)
  const [activo, setActivo] = useState(false)
  const sentinel = useRef<WakeLockSentinel | null>(null)

  // En efecto y no en el `useState` inicial: el HTML del servidor no conoce ni
  // la API ni el `localStorage` de este navegador.
  useEffect(() => {
    const hay = typeof (navigator as NavigatorConWakeLock).wakeLock?.request === 'function'
    setSoportado(hay)
    if (!hay) return
    try {
      setActivo(window.localStorage.getItem(CLAVE) === 'on')
    } catch {
      // Sin preferencia guardada, apagado. Es el lado que no gasta batería.
    }
  }, [])

  useEffect(() => {
    if (!soportado) return

    const soltar = () => {
      const s = sentinel.current
      sentinel.current = null
      // `release()` rechaza si el bloqueo ya se soltó solo. Da igual.
      void s?.release().catch(() => {})
    }

    if (!activo || !habilitado) {
      soltar()
      return
    }

    let vivo = true
    const tomar = async () => {
      if (!vivo || sentinel.current || document.visibilityState !== 'visible') return
      try {
        const s = await (navigator as NavigatorConWakeLock).wakeLock?.request('screen')
        if (!vivo || !s) {
          void s?.release().catch(() => {})
          return
        }
        sentinel.current = s
        // Si lo suelta la plataforma, que el ref no se quede mintiendo.
        s.addEventListener('release', () => {
          if (sentinel.current === s) sentinel.current = null
        })
      } catch {
        // Batería baja, política del dispositivo, permiso denegado. No es un
        // error que enseñar: el interruptor promete intentarlo, no lograrlo.
      }
    }

    void tomar()
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void tomar()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      soltar()
    }
  }, [soportado, activo, habilitado])

  const alternar = useCallback(() => {
    setActivo((antes) => {
      const ahora = !antes
      try {
        window.localStorage.setItem(CLAVE, ahora ? 'on' : 'off')
      } catch {
        // Sin persistir: vale para esta sesión y se olvida. Aceptable.
      }
      return ahora
    })
  }, [])

  return { soportado, activo, alternar }
}
