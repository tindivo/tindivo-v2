'use client'

import { Icon, Spinner } from '@tindivo/ui'
import type { PointOption } from '../../lib/point-search'
import { PlaceBadge } from '../place-badge'

/** Cuántas coincidencias se muestran: las primeras bastan, el mapa sigue a la vista. */
export const MAX_SUGGESTIONS = 5

/**
 * Las sugerencias de «Buscar un lugar», desplegadas DEBAJO de la barra del
 * pin y no en una pantalla aparte: el mapa sigue a la vista mientras se
 * escribe (decisión de Jesús, 7-oct; antes era una hoja que tapaba todo).
 *
 * Cada fila hace `preventDefault` en `mousedown`: así el campo no pierde el
 * foco antes del clic, y el desplegable (que se cierra al salir del campo) no
 * desaparece bajo el dedo antes de que la elección cuente.
 */
export function PointSuggestions({
  id,
  options,
  typed,
  ready,
  failed,
  onPick,
}: {
  id: string
  options: readonly PointOption[]
  typed: boolean
  /** `false` mientras se cargan los sitios recientes: no se dice «no hay». */
  ready: boolean
  /** No se pudieron cargar los sitios recientes (sin red): se dice, no se calla. */
  failed: boolean
  onPick: (option: PointOption) => void
}) {
  const empty =
    options.length > 0
      ? null
      : !ready && !typed
        ? 'loading'
        : typed
          ? 'No encontramos ese lugar. Mueve el mapa hasta el punto.'
          : failed
            ? 'No pudimos cargar tus lugares. Revisa tu conexión, o escribe un nombre.'
            : 'Escribe el nombre de un lugar: una botica, un colegio, una tienda.'

  return (
    <section
      id={id}
      aria-label="Sugerencias"
      className="absolute inset-x-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-2xl border border-ink/[0.06] bg-card py-1 shadow-elev-3"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(o)}
          className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors active:bg-ink/[0.05]"
        >
          {o.category ? (
            <PlaceBadge category={o.category} size={32} />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[#1D4ED8]">
              <Icon
                name={o.kind === 'home' ? 'home' : 'history'}
                size={18}
                filled={o.kind === 'home'}
              />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">{o.title}</span>
            {o.subtitle && o.subtitle !== o.title && (
              <span className="block truncate text-[13px] font-medium text-ink-muted">
                {o.subtitle}
              </span>
            )}
          </span>
        </button>
      ))}
      {empty === 'loading' && (
        <div className="flex items-center gap-2 px-3 py-3 text-[14px] text-ink-muted">
          <Spinner size="xs" variant="brand" />
          Cargando tus lugares…
        </div>
      )}
      {empty && empty !== 'loading' && (
        <p className="px-3 py-3 text-[14px] leading-snug text-ink-muted">{empty}</p>
      )}
    </section>
  )
}
