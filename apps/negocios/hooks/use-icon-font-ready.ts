'use client'

import { useEffect, useState } from 'react'

const ICON_FONT = "24px 'Material Symbols Rounded'"

/**
 * Devuelve `true` cuando la fuente de iconos (Material Symbols Rounded) ha
 * terminado de cargar. Esto evita el flash visual en el que los iconos del
 * dashboard aparecen como espacios en blanco mientras la fuente llega.
 *
 * Incluye un timeout de seguridad para nunca bloquear la UI si la fuente
 * falla o tarda demasiado.
 */
export function useIconFontReady(timeoutMs = 3000) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) setReady(true)
    }, timeoutMs)

    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts
        .load(ICON_FONT)
        .then(() => {
          if (!cancelled) setReady(true)
        })
        .catch(() => {
          if (!cancelled) setReady(true)
        })
    } else {
      setReady(true)
    }

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [timeoutMs])

  return ready
}
