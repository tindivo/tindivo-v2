'use client'

import { BottomSheet, Button } from '@tindivo/ui'

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
        <h2 className="font-display text-title font-bold tracking-tight">
          ¿El pedido ya está listo?
        </h2>
        <p className="mt-1.5 text-body text-ink-muted">Pregunta en el mostrador antes de marcar.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button className="w-full" onClick={onReady}>
            Sí, está listo
          </Button>
          <Button variant="outline" className="w-full" onClick={onWaiting}>
            Aún no
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
