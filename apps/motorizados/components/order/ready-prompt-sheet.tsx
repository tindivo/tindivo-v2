'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'

/**
 * Al llegar al local: ¿el pedido ya salió de cocina? (HU-D-020).
 *
 * "AÚN NO" DEJA DE IR EN NARANJA. `outline` pinta el texto con el color de
 * marca, así que las dos opciones competían por el mismo peso visual — y no son
 * simétricas: una avanza el pedido y la otra solo cierra la hoja. En una
 * pantalla que se contesta con guantes y de un vistazo, dos naranjas obligan a
 * leer para distinguirlas.
 */
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
            <Icon name="check_circle" size={20} filled />
            Sí, está listo
          </Button>
          <Button
            variant="outline"
            className="w-full border-ink/15 text-ink-muted hover:bg-surface"
            onClick={onWaiting}
          >
            Aún no
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
