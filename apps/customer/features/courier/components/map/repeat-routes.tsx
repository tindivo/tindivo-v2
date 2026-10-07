'use client'

import { Icon } from '@tindivo/ui'
import type { CourierRoute } from '../../lib/routes'

function routeTitle(r: CourierRoute): string {
  const from = r.origin.label || r.origin.referenceText
  const to = r.destination.label || r.destination.referenceText
  return `${from} → ${to}`
}

/**
 * Las entregas anteriores, desplegadas desde «Ver anteriores» (a la derecha de
 * «Paso 1 de 2», `PinDropOverlay`). Antes la última se mostraba siempre como
 * una tarjeta grande arriba del panel y le quitaba ~100 px al mapa en cada
 * pedido, se repitiera o no; ahora no ocupa nada hasta que se pide (decisión
 * de Jesús, 7-oct).
 *
 * Un toque deja la ruta entera puesta y lleva a «Detalles», donde solo se
 * revisa y se pide. La lista tiene tope y su propio scroll: cada fila que
 * crece aquí le quita alto al mapa.
 */
export function RepeatRoutes({
  routes,
  onRepeat,
}: {
  routes: readonly CourierRoute[]
  onRepeat: (route: CourierRoute) => void
}) {
  return (
    <section
      id="entregas-anteriores"
      aria-label="Entregas anteriores"
      className="mb-2 flex max-h-[8.5rem] flex-col gap-1.5 overflow-y-auto"
    >
      {routes.map((r) => (
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
    </section>
  )
}
