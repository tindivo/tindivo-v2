'use client'

import { useEffect, useState } from 'react'
import { MS } from './primitives'

// Pub/sub módulo-level: permite notificar éxito desde cualquier página sin pasar
// por DashboardCtx (el editor de plato no consume useDashboard) y sin provocar
// re-renders del chrome. Un solo host (en AuthedChrome) basta.
let listener: ((text: string) => void) | null = null

/** Toast verde de éxito, 3s (DECISIONS §16). Los errores van inline, no aquí. */
export function notifySuccess(text: string): void {
  listener?.(text)
}

/**
 * Host único del toast de éxito. Vive en el chrome persistente, así el toast
 * sobrevive navegaciones (p. ej. "Plato creado" tras router.replace('/menu')).
 * Offset bajo NewOrderToast (top 14) para no solaparse si coinciden.
 */
export function SuccessToastHost() {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    listener = (text) => {
      if (timer) clearTimeout(timer)
      setToast({ text, id: Date.now() })
      timer = setTimeout(() => setToast(null), 3000)
    }
    return () => {
      listener = null
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Entrada con slide+fade corto; se re-dispara por cambio de `id`.
  useEffect(() => {
    if (!toast) {
      setShown(false)
      return
    }
    setShown(false)
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [toast])

  if (!toast) return null
  return (
    <div
      key={toast.id}
      role="status"
      style={{
        position: 'fixed',
        top: 62,
        left: '50%',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--tv-success)',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 14,
        boxShadow: '0 8px 24px -6px rgba(22,163,74,0.55)',
        transform: `translateX(-50%) translateY(${shown ? 0 : -10}px)`,
        opacity: shown ? 1 : 0,
        transition: 'transform 200ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease',
        pointerEvents: 'none',
      }}
    >
      <MS name="check_circle" size={18} filled />
      {toast.text}
    </div>
  )
}
