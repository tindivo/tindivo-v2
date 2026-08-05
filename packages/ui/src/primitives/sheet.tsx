'use client'

import type { ReactNode } from 'react'

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
  if (!open) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
    <div
      className="fixed inset-0 z-80 flex items-end justify-center bg-black/50 animate-[t-fade-in_200ms_ease] backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) onClose()
      }}
    >
      <div
        className="flex w-full max-w-[768px] max-h-[90%] flex-col overflow-hidden rounded-t-[28px] bg-surface text-ink shadow-[0_-28px_90px_-54px_rgba(0,0,0,0.45)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)]"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  )
}
