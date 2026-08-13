'use client'

import { type ReactNode, useEffect } from 'react'

/** Bottom-sheet modal (slideUp). Cierra al click fuera o Escape. */
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose?: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
    <div
      className="fixed inset-0 z-80 flex items-end justify-center bg-ink/35 animate-[t-fade-in_200ms_ease] backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) onClose()
      }}
    >
      <div
        className="flex w-full max-w-[768px] max-h-[85dvh] min-h-0 flex-col overflow-hidden rounded-t-[28px] bg-surface text-ink shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.35)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)] overscroll-contain"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-8 rounded-full bg-ink/20" />
        </div>
        {children}
      </div>
    </div>
  )
}
