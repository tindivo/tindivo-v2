'use client'

import { Icon } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import type { PointOption } from '../../lib/point-search'
import type { CourierEditingPoint } from '../../types'
import { PlaceBadge } from '../place-badge'

const TITLE: Record<CourierEditingPoint, string> = {
  origin: '¿Dónde recogemos?',
  destination: '¿Dónde entregamos?',
}

/**
 * La lupa del pin: buscar un lugar del pueblo, un sitio donde ya se pidió o
 * «Mi dirección», sin arrastrar el mapa. Elegir uno NO confirma el punto: el
 * mapa vuela ahí y deja la referencia escrita, y la persona ajusta la puerta
 * si hace falta y confirma. Las coordenadas de un lugar son de su centro, no
 * siempre de su puerta.
 *
 * Vive DENTRO del diálogo del pin (`PinDropOverlay`) y no registra el suyo:
 * con dos `useDialogFocus` a la vez, Escape cerraría los dos. Es el del pin el
 * que, con la búsqueda abierta, la cierra a ella primero. Por la misma razón el
 * campo se enfoca solo (`autoFocus`): el hook enfoca el contenedor para no
 * abrir el teclado sin que nadie lo pida, pero aquí la persona tocó la lupa
 * justo para escribir.
 *
 * `z-[800]`, no un número «de hoja» como 80: vive dentro de la capa del pin,
 * donde la barra de arriba (volver, lupa, Mapa/Satélite) va en 730 y el botón
 * de GPS en 600. Con 80 esa barra quedaba ENCIMA y tapaba el campo de buscar.
 */
export function PointSearchSheet({
  point,
  search,
  onPick,
  onClose,
}: {
  point: CourierEditingPoint
  search: (query: string) => PointOption[]
  onPick: (option: PointOption) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const options = useMemo(() => search(query), [search, query])
  const typed = query.trim().length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar un lugar"
      className="pointer-events-auto fixed inset-0 z-[800] flex flex-col bg-white focus:outline-none"
    >
      <div className="flex items-center gap-2 border-b border-ink/[0.06] p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver al mapa"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors active:bg-ink/[0.06]"
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F4F4F2] px-4">
          <Icon name="search" size={20} className="shrink-0 text-ink-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: la persona tocó la lupa para escribir; sin foco tendría que tocar dos veces.
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            aria-label={`Buscar: ${TITLE[point]}`}
            placeholder="Una botica, un colegio, una casa…"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-muted/70"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!typed && options.length > 0 && (
          <p className="px-2 pt-2 pb-1 text-[13px] font-bold text-ink-muted">Tus lugares</p>
        )}
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(o)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors active:bg-ink/[0.05]"
          >
            {o.category ? (
              <PlaceBadge category={o.category} size={40} />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[#1D4ED8]">
                <Icon
                  name={o.kind === 'home' ? 'home' : 'history'}
                  size={22}
                  filled={o.kind === 'home'}
                />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold text-ink">{o.title}</span>
              {o.subtitle && o.subtitle !== o.title && (
                <span className="block truncate text-[13px] font-medium text-ink-muted">
                  {o.subtitle}
                </span>
              )}
            </span>
          </button>
        ))}
        {options.length === 0 && (
          <p className="px-4 py-10 text-center text-[14px] leading-snug text-ink-muted">
            {typed
              ? 'No lo encontramos. Vuelve al mapa y muévelo hasta el punto.'
              : 'Escribe el nombre de un lugar: una botica, un colegio, una tienda.'}
          </p>
        )}
      </div>
    </div>
  )
}
