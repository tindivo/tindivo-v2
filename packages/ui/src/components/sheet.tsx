'use client'

import type { ReactNode } from 'react'

/** Bottom-sheet modal (slideUp). Cierra al click fuera o Escape. */
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
    <div
      className="t-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="t-modal-sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
