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
  /** Pedido de comida (default) o Tindivo Entregas: cambia los momentos prometidos. */
  kind?: 'order' | 'courier'
}

interface Moment {
  icon: string
  text: string
  /** Solo el momento que no conviene perderse lleva nota y va resaltado. */
  note?: string
}

/**
 * Los momentos que se prometen son EXACTAMENTE los que `send-push` le manda al
 * cliente cuando todo va bien — comida en la rama `OrderStatusChanged`,
 * entregas en `courierNotes`. Si se añade uno aquí sin su push, se promete un
 * aviso que no existe.
 */
const MOMENTS: Record<'order' | 'courier', Moment[]> = {
  order: [
    { icon: 'check', text: 'Cuando el restaurante acepte tu pedido' },
    { icon: 'sports_motorsports', text: 'Cuando el motorizado salga con tu comida' },
    {
      icon: 'location_on',
      text: 'Cuando llegue a tu puerta',
      note: 'El que no conviene perderse: solo espera unos minutos',
    },
  ],
  courier: [
    {
      icon: 'two_wheeler',
      text: 'Cuando un motorizado la tome',
      note: 'Si nadie la toma a tiempo, también te avisamos',
    },
    { icon: 'inventory_2', text: 'Cuando la recoja' },
    { icon: 'check', text: 'Cuando llegue a su destino' },
  ],
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
export function PushPermissionSheet({
  open,
  shortId,
  onClose,
  kind = 'order',
}: PushPermissionSheetProps) {
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
            {kind === 'courier' ? 'Tu entrega' : 'Tu pedido'} pasa por tres momentos en los que vas
            a querer enterarte, aunque tengas el celular guardado.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {MOMENTS[kind].map((m) => (
            <li key={m.text} className="flex items-center gap-3">
              <span
                className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] ${
                  m.note ? 'bg-brand-soft' : 'bg-surface-low'
                }`}
              >
                <Icon
                  name={m.icon}
                  size={18}
                  className={m.note ? 'text-brand' : 'text-ink-muted'}
                />
              </span>
              {m.note ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold leading-snug">{m.text}</span>
                  <span className="text-caption text-warning leading-snug">{m.note}</span>
                </span>
              ) : (
                <span className="text-body font-medium leading-snug">{m.text}</span>
              )}
            </li>
          ))}
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
