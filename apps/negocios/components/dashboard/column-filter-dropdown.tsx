'use client'

import { cn, Icon } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import { COLUMN_FILTER_OPTIONS, type ColumnFilter } from './column-filter'

export {
  COLUMN_FILTER_OPTIONS,
  type ColumnFilter,
  type ColumnFilterOption,
  calculateColumnFilterCounts,
  matchesColumnFilter,
} from './column-filter'

/**
 * Pequeña ventanita desplegable (popover / tooltip flotante) anclada al botón de la cabecera.
 * No oscurece ni bloquea el resto de la pantalla.
 */
export function ColumnFilterDropdown({
  filter,
  counts,
  onChange,
  columnTitle,
}: {
  filter: ColumnFilter
  counts: Record<ColumnFilter, number>
  onChange: (f: ColumnFilter) => void
  columnTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  const activeOption =
    COLUMN_FILTER_OPTIONS.find((o) => o.id === filter) ?? COLUMN_FILTER_OPTIONS[0]
  const isFiltered = filter !== 'all'

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Botón trigger */}
      {isFiltered ? (
        <div className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand-dark">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 hover:opacity-80 cursor-pointer"
            title={`Filtrado por ${activeOption?.label}. Clic para cambiar.`}
          >
            <Icon name={activeOption?.icon ?? 'tune'} size={13} weight={500} />
            <span>{activeOption?.shortLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChange('all')
              setOpen(false)
            }}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-brand/20 cursor-pointer"
            title="Quitar filtro"
          >
            <Icon name="close" size={11} weight={500} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink',
            open && 'bg-ink/[0.08] text-ink',
          )}
          title="Filtrar pedidos en esta columna"
          aria-expanded={open}
        >
          <Icon name="tune" size={14} weight={500} />
        </button>
      )}

      {/* Ventanita flotante tipo tooltip */}
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border border-border bg-white p-1 shadow-elev-3">
          {/* Header sutil */}
          <div className="flex items-center justify-between border-b border-border/60 px-2 py-1.5 text-[11px] font-semibold text-ink-muted">
            <span>{columnTitle ? `Filtrar ${columnTitle}` : 'Filtrar pedidos'}</span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => {
                  onChange('all')
                  setOpen(false)
                }}
                className="font-bold text-brand hover:underline cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Opciones */}
          <div className="flex flex-col gap-0.5 pt-1">
            {COLUMN_FILTER_OPTIONS.map((opt) => {
              const count = counts[opt.id] ?? 0
              const isSelected = filter === opt.id

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] font-medium transition-colors',
                    isSelected
                      ? 'bg-ink font-bold text-white'
                      : 'text-ink hover:bg-surface active:bg-surface-high',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name={opt.icon}
                      size={15}
                      weight={500}
                      className={isSelected ? 'text-white' : 'text-ink-muted'}
                    />
                    <span>{opt.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                        isSelected ? 'bg-white/20 text-white' : 'bg-ink/[0.08] text-ink-muted',
                      )}
                    >
                      {count}
                    </span>
                    {isSelected && (
                      <Icon name="check" size={13} weight={500} className="text-white" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
