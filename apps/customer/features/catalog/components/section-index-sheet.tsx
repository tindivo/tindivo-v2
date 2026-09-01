'use client'

import { BottomSheet } from '@tindivo/ui'
import type { Category } from '@/features/catalog/types'

const LABEL = 'Todas las secciones'

interface SectionIndexSheetProps {
  categories: Category[]
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * El índice de secciones.
 *
 * La tira sirve para lo cercano; con catorce secciones no sirve para saltar:
 * caben cuatro y las otras diez solo existen para quien se le ocurra
 * arrastrar. Aquí están todas de una vez, con su número de platos, en dos
 * columnas. Es lo único que escala a una carta larga.
 */
export function SectionIndexSheet({ categories, onSelect, onClose }: SectionIndexSheetProps) {
  const total = categories.reduce((n, c) => n + c.items.length, 0)

  return (
    <BottomSheet open label={LABEL} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        <div className="sticky top-0 z-10 bg-surface px-[18px] pt-1 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display font-bold text-[19px] tracking-tight">{LABEL}</h2>
            <span className="shrink-0 text-[12.5px] text-ink-muted tabular-nums">
              {total} {total === 1 ? 'plato' : 'platos'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 px-[18px] pb-7">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex min-h-[46px] items-center justify-between gap-2 rounded-[14px] border border-ink/[0.06] bg-card px-3 py-2 text-left shadow-elev-1 transition-all active:scale-[0.98] hover:border-ink/15"
            >
              <span className="min-w-0 font-semibold text-[13.5px] leading-tight tracking-[-0.01em]">
                {c.name}
              </span>
              <span className="shrink-0 font-semibold text-[11.5px] text-ink-subtle tabular-nums">
                {c.items.length}
              </span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
