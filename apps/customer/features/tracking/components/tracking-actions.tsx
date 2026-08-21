import type { TrackingStep } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { SupportLink } from '@/components/support-link'
import { getStatusMessage } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingActionsProps {
  data: Tracking
  current: TrackingStep | null
  cancellable: boolean
}

/**
 * El pie de la pantalla: en qué punto está el pedido, y a quién escribirle.
 *
 * Ya no lleva ni el botón de cancelar (subió a `TrackingCancelRow`, pegado al
 * hero: enterrado aquí abajo lo encontraba quien se equivocó cuando su ventana
 * ya había pasado) ni la tarjeta del motorizado en la puerta (se fue a
 * `TrackingDriver`, junto al nombre de quien está tocando el timbre).
 *
 * Cuando el pedido SÍ se puede cancelar, el mensaje de estado no se pinta: la
 * fila de arriba ya dice lo mismo y con un contador al lado.
 */
export function TrackingActions({ data, current, cancellable }: TrackingActionsProps) {
  return (
    <>
      <div className="mt-5 border-t border-ink/[0.06] pt-4">
        {cancellable ? (
          <div className="flex justify-center">
            <SupportLink orderShortId={data.shortId} />
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-ink/[0.04] bg-white px-3.5 py-3 shadow-elev-1">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon name="check" size={14} filled />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold leading-snug">
                {getStatusMessage(data, current)}
              </div>
              <div className="mt-1.5">
                <SupportLink orderShortId={data.shortId} />
              </div>
            </div>
          </div>
        )}
      </div>

      <Link href="/" className="mt-6 inline-block text-[14px] text-brand">
        ← Volver al inicio
      </Link>
    </>
  )
}
