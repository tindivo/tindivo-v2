'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { descartar, pedirPermiso } from '@/lib/push'

const TITULO = '¿Te avisamos cuando avance?'

interface PushPermissionSheetProps {
  open: boolean
  /** El pedido por el que se está ofreciendo, para recordar el descarte. */
  shortId: string
  /** Se llama tanto si aceptó como si no: la hoja se cierra igual. */
  onClose: () => void
}

/**
 * La hoja que pide el permiso de notificaciones, ANTES que el navegador.
 *
 * Los dos diálogos no son redundancia. El del sistema es un cartucho de un solo
 * disparo (ver `lib/push.ts`): si el cliente toca «Bloquear», no se le puede
 * volver a preguntar desde la web jamás. Esta hoja existe para que ese diálogo
 * solo aparezca delante de alguien que ya dijo que sí — un «Ahora no» aquí no
 * gasta nada y se puede volver a ofrecer en el siguiente pedido.
 *
 * Por eso `pedirPermiso` se llama DENTRO del `onClick` y sin ningún `await`
 * antes: el permiso solo se puede pedir dentro del gesto del usuario, y un
 * `await` previo rompe ese gesto.
 *
 * Los tres momentos que se prometen son exactamente los tres que manda
 * `send-push` al cliente en un pedido que va bien. No se prometen más: una lista
 * de siete avisos asusta, y prometer avisos que no existen es peor que no
 * prometer nada.
 */
export function PushPermissionSheet({ open, shortId, onClose }: PushPermissionSheetProps) {
  const [pidiendo, setPidiendo] = useState(false)

  const rechazar = () => {
    descartar(shortId)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={rechazar} label={TITULO}>
      <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
        <div className="flex flex-col items-start gap-2.5">
          <div className="flex h-13 w-13 items-center justify-center rounded-full bg-brand-soft">
            <Icon name="notifications_active" size={26} className="text-brand" />
          </div>
          <h2 className="font-display text-[24px] font-bold leading-tight tracking-tight">
            {TITULO}
          </h2>
          <p className="text-body text-ink-muted leading-relaxed">
            Tu pedido pasa por tres momentos en los que vas a querer enterarte, aunque tengas el
            celular guardado.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          <li className="flex items-center gap-3">
            <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-surface-low">
              <Icon name="check" size={18} className="text-ink-muted" />
            </span>
            <span className="text-body font-medium leading-snug">
              Cuando el restaurante acepte tu pedido
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-surface-low">
              <Icon name="sports_motorsports" size={18} className="text-ink-muted" />
            </span>
            <span className="text-body font-medium leading-snug">
              Cuando el motorizado salga con tu comida
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft">
              <Icon name="location_on" size={18} className="text-brand" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-semibold leading-snug">
                Cuando llegue a tu puerta
              </span>
              <span className="text-caption text-warning leading-snug">
                El que no conviene perderse: solo espera unos minutos
              </span>
            </span>
          </li>
        </ul>

        <div className="flex flex-col gap-2">
          <Button
            variant="brand"
            size="lg"
            disabled={pidiendo}
            onClick={() => {
              setPidiendo(true)
              // Sin `await` delante: el gesto del usuario no sobrevive a uno, y
              // sin gesto el navegador ignora la petición de permiso.
              void pedirPermiso().finally(() => {
                setPidiendo(false)
                // Se cierra pase lo que pase. Si dijo que no al diálogo del
                // sistema, `sePuedeOfrecer` ya no volverá a dejar abrirla:
                // el estado pasa a 'bloqueado'.
                onClose()
              })
            }}
          >
            {pidiendo ? 'Un momento…' : 'Sí, avísenme'}
          </Button>
          <Button variant="ghost" size="lg" onClick={rechazar}>
            Ahora no
          </Button>
        </div>

        <p className="text-center text-caption text-ink-subtle leading-relaxed">
          Puedes cambiarlo cuando quieras desde tu cuenta.
        </p>
      </div>
    </BottomSheet>
  )
}
