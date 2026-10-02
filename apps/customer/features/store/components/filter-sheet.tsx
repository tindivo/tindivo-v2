'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { fetchStoreListClient } from '../lib/api'
import type { StoreUrlFilters } from '../types'

type Draft = Pick<StoreUrlFilters, 'condicion' | 'orden'>

const CONDITIONS: { value: Draft['condicion']; label: string }[] = [
  { value: '', label: 'Todo' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'segunda', label: 'Segunda' },
]

const ORDERS: { value: Draft['orden']; label: string }[] = [
  { value: '', label: 'Recientes' },
  { value: 'precio_asc', label: 'Menor precio' },
  { value: 'precio_desc', label: 'Mayor precio' },
]

const TITLE = 'Filtros'

/**
 * Hoja de filtros (PRD §5.1): Condición y Orden, «Limpiar» arriba y un botón
 * que dice cuántos artículos vas a ver. El conteo se pide a la API con el
 * borrador de filtros, así que es el número real y no una suposición.
 */
export function FilterSheet({
  open,
  onClose,
  current,
  base,
  onApply,
}: {
  open: boolean
  onClose: () => void
  current: Draft
  /** Búsqueda y categoría vigentes: el conteo las respeta. */
  base: Pick<StoreUrlFilters, 'q' | 'categoria'>
  onApply: (d: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>(current)
  const [count, setCount] = useState<number | null>(null)

  // Al abrir, el borrador parte de lo vigente.
  useEffect(() => {
    if (open) setDraft(current)
  }, [open, current])

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    setCount(null)
    fetchStoreListClient({ ...base, ...draft }, ctrl.signal)
      .then((d) => setCount(d.products.length))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [open, draft, base])

  return (
    <BottomSheet open={open} onClose={onClose} label={TITLE}>
      <div className="st-sheet">
        <div className="st-sheet-h">
          <h2>{TITLE}</h2>
          <button
            type="button"
            className="st-reset"
            onClick={() => setDraft({ condicion: '', orden: '' })}
          >
            Limpiar
          </button>
        </div>

        <div className="st-sh-l">Condición</div>
        <div className="st-seg" role="group" aria-label="Condición">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={draft.condicion === c.value}
              onClick={() => setDraft((d) => ({ ...d, condicion: c.value }))}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="st-sh-l">Ordenar por</div>
        <div className="st-opts" role="group" aria-label="Orden">
          {ORDERS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="st-opt"
              aria-pressed={draft.orden === o.value}
              onClick={() => setDraft((d) => ({ ...d, orden: o.value }))}
            >
              {o.label}
              <span className="rd">
                {draft.orden === o.value && <Icon name="check" size={15} weight={700} />}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="st-cta"
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          {count === null
            ? 'Ver artículos'
            : `Ver ${count} ${count === 1 ? 'artículo' : 'artículos'}`}
        </button>
      </div>
    </BottomSheet>
  )
}
