'use client'

import { Icon } from '@tindivo/ui'
import type { RefObject } from 'react'
import { CategoryTabs } from '@/features/catalog/components/category-tabs'
import { MenuSearchField } from '@/features/catalog/components/menu-search-field'
import type { Category } from '@/features/catalog/types'

interface MenuToolbarProps {
  containerRef: RefObject<HTMLDivElement | null>
  categories: Category[]
  businessName: string
  active: string
  onSelect: (id: string) => void
  onOpenIndex: () => void
  /** Falso en cartas cortas: ahí el buscador solo roba altura de pantalla. */
  searchEnabled: boolean
  /** Con el buscador en uso las pestañas sobran: debajo no está la carta. */
  searchActive: boolean
  query: string
  onQueryChange: (value: string) => void
  onSearchFocus: () => void
  onSearchBlur: () => void
  onSearchClear: () => void
}

/**
 * Con una sola sección no hay nada que navegar: la tira sobra y el subrayado
 * no informa de nada. Al Punto y Pollería Nadia tienen tres, así que ahí sí.
 */
const MIN_SECCIONES_PARA_TIRA = 2

/**
 * El índice existe para las secciones que NO caben en la tira. Por debajo de
 * este número caben todas, y el botón sería una puerta a la misma habitación
 * en la que ya estás — además de decir «3» al lado de tres pestañas visibles.
 */
const MIN_SECCIONES_PARA_INDICE = 5

/**
 * La única barra fija de la carta. Dos filas, y cada una hace una cosa:
 *
 * 1. Buscar — un campo con su texto, del ancho de la pantalla.
 * 2. Navegar — pestañas de sección, más el botón índice que abre las que no
 *    caben. El índice NO se desplaza con la tira: si se fuera de la pantalla
 *    dejaría de ser la salida de emergencia de una carta larga.
 *
 * Antes las dos compartían fila y la búsqueda sustituía a los chips mientras
 * estaba abierta. La idea era ahorrar altura; el precio fue que ninguna de las
 * dos se veía.
 */
export function MenuToolbar({
  containerRef,
  categories,
  businessName,
  active,
  onSelect,
  onOpenIndex,
  searchEnabled,
  searchActive,
  query,
  onQueryChange,
  onSearchFocus,
  onSearchBlur,
  onSearchClear,
}: MenuToolbarProps) {
  const hayTira = categories.length >= MIN_SECCIONES_PARA_TIRA
  const hayIndice = categories.length >= MIN_SECCIONES_PARA_INDICE

  // Sin secciones que navegar y sin buscador que ofrecer, la barra no pinta nada.
  if (categories.length === 0 || (!hayTira && !searchEnabled)) return null

  return (
    <div
      ref={containerRef}
      className="sticky top-0 z-10 border-ink/[0.07] border-b bg-surface/[0.96] backdrop-blur-md"
    >
      <div className="mx-auto max-w-[768px] md:max-w-[860px]">
        {searchEnabled && (
          <MenuSearchField
            query={query}
            businessName={businessName}
            onChange={onQueryChange}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            onClear={onSearchClear}
          />
        )}

        {hayTira && !searchActive && (
          <div className="flex items-end pt-2">
            <CategoryTabs categories={categories} active={active} onSelect={onSelect} />
            {hayIndice && (
              <button
                type="button"
                onClick={onOpenIndex}
                aria-label={`Ver las ${categories.length} secciones de la carta`}
                className="mr-4 mb-[5px] ml-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-ink/15 bg-card px-2.5 font-bold text-[12.5px] shadow-elev-1 transition-all active:scale-[0.97] hover:border-ink/25"
              >
                <Icon name="grid_view" size={15} />
                <span className="tabular-nums">{categories.length}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
