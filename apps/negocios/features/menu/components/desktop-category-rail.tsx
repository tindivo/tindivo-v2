import { Card, Icon } from '@tindivo/ui'
import type { MenuCategory } from '../types'

interface DesktopCategoryRailProps {
  cats: MenuCategory[]
  activeCatId: string | null
  onCatClick: (id: string) => void
}

export function DesktopCategoryRail({ cats, activeCatId, onCatClick }: DesktopCategoryRailProps) {
  const withGroups = cats.flatMap((c) => c.items).filter((i) => i.modifierGroups.length > 0).length
  const totalItems = cats.flatMap((c) => c.items).length

  return (
    <Card className="sticky top-0 self-start p-3.5">
      <p className="mb-2 px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
        Categorías
      </p>
      <div className="flex flex-col gap-1">
        {cats.map((cat, i) => {
          const isActive = activeCatId === cat.id || (activeCatId === null && i === 0)
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCatClick(cat.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] font-bold transition-all ${
                isActive ? 'bg-ink text-white' : 'text-ink hover:bg-surface'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{cat.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-ink/[0.08] text-ink'
                }`}
              >
                {cat.items.length}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 border-t border-ink/[0.06] pt-3">
        <p className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink/55">
          Leyenda
        </p>
        <div className="flex flex-col gap-1.5 px-1 text-[11px] text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-bold text-info">
              <Icon name="tune" size={10} />
              Con opciones
            </span>
            <span>grupos de modificadores</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
              <Icon name="shopping_cart" size={10} />
              Directo
            </span>
            <span>va al carrito sin modal</span>
          </div>
          {cats.length > 0 && (
            <p className="mt-1 leading-relaxed">
              {withGroups} con opciones · {totalItems - withGroups} directos
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
