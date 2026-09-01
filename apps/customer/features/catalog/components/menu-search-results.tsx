'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { MenuItemCard } from '@/features/catalog/components/menu-item-card'
import type { MenuHit } from '@/features/catalog/lib/menu-search'
import type { MenuItem } from '@/features/catalog/types'

interface MenuSearchResultsProps {
  query: string
  hits: MenuHit[]
  businessName: string
  disabled?: boolean
  onItemClick: (item: MenuItem) => void
  onQuickAdd: (item: MenuItem) => void
}

export function MenuSearchResults({
  query,
  hits,
  businessName,
  disabled,
  onItemClick,
  onQuickAdd,
}: MenuSearchResultsProps) {
  const term = query.trim()

  if (hits.length === 0) {
    return (
      <div aria-live="polite" className="px-2 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.05] text-ink/40">
          <Icon name="search_off" size={22} />
        </span>
        <p className="mt-3 font-semibold text-[15px]">
          No encontramos “{term}” en {businessName}
        </p>
        <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-[1.45] text-ink/55">
          Prueba con otro nombre, o con un ingrediente: también buscamos dentro de la descripción de
          cada plato.
        </p>
        {/* La salida honesta del callejón: si no está en esta carta, quizá esté
            en otra. Se lo pasamos al buscador de la portada con la consulta ya
            escrita para que no tenga que teclearla otra vez. */}
        <Link
          href={`/?q=${encodeURIComponent(term)}`}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-card px-4 py-2.5 font-semibold text-[13.5px] text-ink shadow-elev-1 transition-all hover:border-ink/20 hover:shadow-elev-2 active:scale-[0.98]"
        >
          <Icon name="travel_explore" size={17} />
          Buscar en todos los negocios
        </Link>
      </div>
    )
  }

  return (
    <div className="pt-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate font-display text-[22px] font-bold tracking-tight">
          “{term}”
        </div>
        <span aria-live="polite" className="shrink-0 text-[12.5px] text-ink-muted tabular-nums">
          {hits.length} {hits.length === 1 ? 'plato' : 'platos'}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
        {hits.map((hit) => (
          <MenuItemCard
            key={hit.item.id}
            item={hit.item}
            disabled={disabled}
            onClick={onItemClick}
            onQuickAdd={onQuickAdd}
            categoryLabel={hit.categoryName}
            nameRanges={hit.nameRanges}
            descriptionRanges={hit.descriptionRanges}
          />
        ))}
      </div>
    </div>
  )
}
