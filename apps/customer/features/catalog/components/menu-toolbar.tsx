'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { CategoryTabs } from '@/features/catalog/components/category-tabs'
import { MenuSearchField } from '@/features/catalog/components/menu-search-field'
import type { Category } from '@/features/catalog/types'

interface MenuToolbarProps {
  categories: Category[]
  active: string
  onSelect: (id: string) => void
  /** Falso en cartas cortas: ahí el buscador solo roba altura de pantalla. */
  searchEnabled: boolean
  searchOpen: boolean
  query: string
  onQueryChange: (value: string) => void
  onOpenSearch: () => void
  onCloseSearch: () => void
}

/**
 * La única barra fija de la carta: buscar y navegar por categorías comparten
 * fila. Son dos formas de hacer lo mismo —llegar a un plato— y en móvil no hay
 * presupuesto para dos filas pegadas arriba, así que la búsqueda **sustituye**
 * a los chips mientras está abierta en vez de apilarse sobre ellos.
 */
export function MenuToolbar({
  categories,
  active,
  onSelect,
  searchEnabled,
  searchOpen,
  query,
  onQueryChange,
  onOpenSearch,
  onCloseSearch,
}: MenuToolbarProps) {
  if (categories.length === 0) return null

  return (
    <div className="sticky top-0 z-10 border-b border-ink/[0.06] bg-surface/[0.95] backdrop-blur-md">
      <div className="mx-auto flex max-w-[768px] items-center md:max-w-[860px]">
        {searchOpen ? (
          <MenuSearchField query={query} onChange={onQueryChange} onClose={onCloseSearch} />
        ) : (
          <>
            {searchEnabled && (
              <div className="flex shrink-0 items-center py-2.5 pr-2 pl-4">
                <IconButton
                  type="button"
                  size="sm"
                  onClick={onOpenSearch}
                  aria-label="Buscar en la carta"
                  aria-expanded={false}
                  className="border border-ink/[0.08] bg-card shadow-elev-1 hover:border-ink/20 hover:bg-ink/[0.03]"
                >
                  <Icon name="search" size={19} />
                </IconButton>
                {/* Separa el buscador de los chips: sin él, con la tira
                    desplazada, la lupa parece una categoría más. */}
                <span aria-hidden className="ml-2 h-5 w-px bg-ink/[0.08]" />
              </div>
            )}
            <CategoryTabs
              categories={categories}
              active={active}
              onSelect={onSelect}
              tightStart={searchEnabled}
            />
          </>
        )}
      </div>
    </div>
  )
}
