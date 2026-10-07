'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import type { CourierRoute } from '../../lib/routes'

function routeTitle(r: CourierRoute): string {
  const from = r.origin.label || r.origin.referenceText
  const to = r.destination.label || r.destination.referenceText
  return `${from} → ${to}`
}

const DAY = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Lima',
})

/** «Medicinas · 7 oct»: lo que se llevó y cuándo, para reconocerla. */
function routeDetail(r: CourierRoute): string {
  const when = r.createdAt ? DAY.format(new Date(r.createdAt)).replace('.', '') : ''
  return [r.itemDescription, when].filter(Boolean).join(' · ')
}

/**
 * «Entregas anteriores», en una hoja que sube desde abajo al tocar «Ver
 * anteriores» (a la derecha de «Ubicación 1 de 2», `PinDropOverlay`). Antes se
 * desplegaba dentro del panel del pin, empujaba el título y encogía el mapa
 * (Jesús, 7-oct; `Docs/Entregas/ux-entrada/08`).
 *
 * Cada fila dice qué pasa al tocarla («Usar estos datos»): deja la ruta entera
 * puesta y lleva a «Detalles», donde solo se revisa y se pide. «Listo y
 * pagado» queda sin marcar: es de este envío.
 */
export function RepeatRoutesSheet({
  open,
  routes,
  onRepeat,
  onClose,
}: {
  open: boolean
  routes: readonly CourierRoute[]
  onRepeat: (route: CourierRoute) => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Entregas anteriores">
      <div className="flex flex-col gap-2.5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            Entregas anteriores
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2] text-ink"
          >
            <Icon name="close" size={22} />
          </button>
        </div>
        {routes.map((r) => (
          <button
            key={`${routeTitle(r)}·${r.createdAt ?? ''}`}
            type="button"
            onClick={() => onRepeat(r)}
            className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)] transition-transform active:scale-[0.98]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#EEF3FF] text-[#1D4ED8]">
              <Icon name="history" size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold text-ink">{routeTitle(r)}</span>
              {routeDetail(r) && (
                <span className="block truncate text-[13px] font-medium text-ink-muted">
                  {routeDetail(r)}
                </span>
              )}
              <span className="mt-0.5 block text-[13px] font-bold text-[#1D4ED8]">
                Usar estos datos
              </span>
            </span>
            <Icon name="chevron_right" size={22} className="shrink-0 text-ink-muted" />
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
