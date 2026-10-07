'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { CourierRoute } from '../../lib/routes'

function routeTitle(r: CourierRoute): string {
  const from = r.origin.label || r.origin.referenceText
  const to = r.destination.label || r.destination.referenceText
  return `${from} → ${to}`
}

/**
 * «Repetir una entrega», arriba del panel del pin de A. Solo aparece si la
 * persona ya tiene entregas que llegaron. Muestra la última y, si hay más,
 * «Ver anteriores» despliega hasta tres. Un toque deja la ruta entera puesta y
 * lleva a «Detalles», donde solo se revisa y se pide.
 *
 * Una tarjeta compacta y no una lista abierta: cada fila que crece aquí le
 * quita alto al mapa de arriba.
 */
export function RepeatRoutes({
  routes,
  onRepeat,
}: {
  routes: readonly CourierRoute[]
  onRepeat: (route: CourierRoute) => void
}) {
  const [all, setAll] = useState(false)
  const [first, ...rest] = routes
  if (!first) return null
  const shown = all ? routes : [first]

  return (
    <section aria-label="Repetir una entrega" className="mb-3 flex flex-col gap-1.5">
      {shown.map((r) => (
        <button
          key={routeTitle(r)}
          type="button"
          onClick={() => onRepeat(r)}
          className="flex items-center gap-3 rounded-2xl bg-[#EEF3FF] px-3 py-2.5 text-left transition-transform active:scale-[0.98]"
        >
          <Icon name="history" size={22} className="shrink-0 text-[#1D4ED8]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold text-[#1D4ED8]">Repetir</span>
            <span className="block truncate text-[15px] font-bold text-ink">{routeTitle(r)}</span>
          </span>
          <Icon name="chevron_right" size={22} className="shrink-0 text-ink-muted" />
        </button>
      ))}
      {rest.length > 0 && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start px-1 text-[13px] font-bold text-[#1D4ED8]"
        >
          Ver anteriores ({rest.length})
        </button>
      )}
    </section>
  )
}
