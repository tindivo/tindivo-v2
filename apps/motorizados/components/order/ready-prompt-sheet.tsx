'use client'

import { BottomSheet } from '@tindivo/ui'

/** Al llegar al local: ¿el pedido ya salió de cocina? (HU-D-020). */
export function ReadyPromptSheet({
  onReady,
  onWaiting,
}: {
  onReady: () => void
  onWaiting: () => void
}) {
  return (
    <BottomSheet open onClose={onWaiting}>
      <div className="p-5 pb-7">
        <h2 className="t-display text-[20px]">¿El pedido ya está listo?</h2>
        <p className="t-muted mt-1.5 text-[14px]">Pregunta en el mostrador antes de marcar.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" className="t-btn t-btn-primary" onClick={onReady}>
            Sí, está listo
          </button>
          <button type="button" className="t-btn t-btn-ghost" onClick={onWaiting}>
            Aún no
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
