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

export interface PwaInstall {
  /** Ya está en la pantalla de inicio. No hay nada que ofrecer. */
  instalada: boolean
  isIOS: boolean
  /** Chromium disparó `beforeinstallprompt`: se instala en un toque. */
  puedeInstalar: boolean
  instalar: () => Promise<boolean>
  /** Ya se evaluó en cliente. Evita parpadeos durante la hidratación. */
  listo: boolean
}

/**
 * Detección de plataforma y estado de instalación. Sin UI.
 *
 * GEMELO DEL DE MOTORIZADOS (`apps/motorizados/hooks/use-pwa-install.ts`), y
 * copiado a propósito en vez de subido a `packages/ui`: son dos usos, y la
 * regla de la casa es no extraer hasta el tercero. Si aparece un tercero, este
 * es el momento de juntarlos.
 *
 * LOS DOS CAMINOS NO SON SIMÉTRICOS, y de ahí que haga falta `isIOS`:
 *
 *   · En Chromium instalar es COMODIDAD. El push ya funciona en el navegador
 *     con solo conceder el permiso, así que esto solo añade icono y arranque
 *     directo. Hay evento, hay diálogo nativo, se resuelve en un toque.
 *   · En iOS es REQUISITO. Safari solo entrega Web Push a apps añadidas a la
 *     pantalla de inicio (16.4+). Y no hay ningún evento: no existe forma
 *     programática de ofrecerlo, solo explicar los pasos.
 *
 * Todo el acceso a `window`/`navigator` vive dentro de efectos: en SSR no
 * existen. Hasta que corre el primer efecto, `listo` es false y la UI no debería
 * decidir nada.
 */
export function usePwaInstall(): PwaInstall {
  const [instalada, setInstalada] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [puedeInstalar, setPuedeInstalar] = useState(false)
  const [listo, setListo] = useState(false)
  const evento = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    // `MSStream` es el descarte clásico de IE11 móvil, que también encaja en el
    // patrón de user agent pero no es iOS.
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))
    setInstalada(standalone)
    setListo(true)
  }, [])

  useEffect(() => {
    const alPoderInstalar = (ev: Event) => {
      // Sin `preventDefault` Chrome enseña su propio mini-infobar y el evento se
      // pierde: no habría forma de ofrecerlo desde dentro de la app, que es
      // donde se puede elegir el momento.
      ev.preventDefault()
      evento.current = ev as BeforeInstallPromptEvent
      setPuedeInstalar(true)
    }
    // Instalada ya no vuelve a dispararse el evento: hay que apagar la oferta a
    // mano o se queda ofreciendo lo que ya se hizo.
    const alInstalar = () => {
      evento.current = null
      setPuedeInstalar(false)
      setInstalada(true)
    }

    window.addEventListener('beforeinstallprompt', alPoderInstalar)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  const instalar = useCallback(async (): Promise<boolean> => {
    const ev = evento.current
    if (!ev) return false
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      // El evento es de un solo uso: reutilizarlo lanza.
      evento.current = null
      setPuedeInstalar(false)
      return outcome === 'accepted'
    } catch {
      return false
    }
  }, [])

  return { instalada, isIOS, puedeInstalar, instalar, listo }
}
