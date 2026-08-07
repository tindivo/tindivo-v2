'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * El evento no está en la lib DOM de TypeScript (es propuesta, solo Chromium),
 * así que se declara aquí con lo que se usa de él.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type PwaInstallState = {
  isStandalone: boolean
  isIOS: boolean
  /** Android/Chrome disparó `beforeinstallprompt` y se puede instalar en un toque. */
  canPrompt: boolean
  promptInstall: () => Promise<boolean>
  /** Ya se evaluó en cliente. Evita parpadeos del banner durante la hidratación. */
  ready: boolean
}

/**
 * Detección de plataforma y modo instalado. Sin UI.
 *
 * Todo el acceso a `window`/`navigator` vive dentro de efectos: en SSR estos
 * valores no existen y leerlos en el cuerpo del hook rompería el render del
 * servidor. Hasta que el primer efecto corre, `ready` es false y la UI no
 * debería decidir nada.
 */
export function usePwaInstall(): PwaInstallState {
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [ready, setReady] = useState(false)
  const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    // `MSStream` es el descarte clásico de IE11 móvil, que también encaja en
    // el patrón de user agent pero no es iOS.
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)

    setIsStandalone(standalone)
    setIsIOS(ios)
    setReady(true)
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (ev: Event) => {
      // Sin `preventDefault` Chrome enseña su propio mini-infobar y el evento
      // se pierde: no habría forma de ofrecer la instalación desde la app.
      ev.preventDefault()
      promptEventRef.current = ev as BeforeInstallPromptEvent
      setCanPrompt(true)
    }

    // Una vez instalada, el evento ya no vuelve a dispararse: hay que apagar
    // la oferta a mano o el banner se queda ofreciendo lo que ya se hizo.
    const onInstalled = () => {
      promptEventRef.current = null
      setCanPrompt(false)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const ev = promptEventRef.current
    if (!ev) return false
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      // El evento es de un solo uso: reutilizarlo lanza.
      promptEventRef.current = null
      setCanPrompt(false)
      return outcome === 'accepted'
    } catch (err) {
      console.error('[pwa] promptInstall failed', err)
      return false
    }
  }, [])

  return { isStandalone, isIOS, canPrompt, promptInstall, ready }
}
