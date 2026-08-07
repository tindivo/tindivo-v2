'use client'

import { cn, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'

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
      className={cn(
        'fixed left-1/2 top-[62px] z-[300] flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(22,163,74,0.55)] transition-[transform,opacity] duration-200 pointer-events-none',
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2.5 opacity-0',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1), ease',
      }}
    >
      <Icon name="check_circle" size={18} filled />
      {toast.text}
    </div>
  )
}
