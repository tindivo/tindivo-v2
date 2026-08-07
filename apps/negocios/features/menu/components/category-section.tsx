import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { MenuCategory } from '../types'
import { ItemRow } from './item-row'

interface CategorySectionProps {
  cat: MenuCategory
}

export function CategorySection({ cat }: CategorySectionProps) {
  const unavailable = cat.items.filter((i) => !i.is_available).length
  const withGroups = cat.items.filter((i) => i.modifierGroups.length > 0).length

  return (
    <div id={`cat-${cat.id}`} className="mb-5 scroll-mt-5">
      <div className="flex items-center gap-2 px-1 py-2">
        <h3 className="flex-1 text-[17px] font-bold text-ink">{cat.name}</h3>
        <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold text-ink">
          {cat.items.length}
        </span>
        {withGroups > 0 && (
          <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold text-info">
            {withGroups} con opciones
          </span>
        )}
        {unavailable > 0 && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
            {unavailable} agotado{unavailable > 1 ? 's' : ''}
          </span>
        )}
        <Link
          href={`/menu/item/nuevo?cat=${cat.id}`}
          className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-brand-dark"
        >
          <Icon name="add" size={14} />
          Plato
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        {cat.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
