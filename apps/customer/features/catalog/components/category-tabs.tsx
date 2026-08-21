'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import type { Category } from '@/features/catalog/types'

interface CategoryTabsProps {
  categories: Category[]
  active: string
  onSelect: (id: string) => void
  /**
   * Recorta el margen inicial cuando `MenuToolbar` ya puso algo a la izquierda
   * (el botón de buscar): con `px-4` de los dos lados el hueco se dobla.
   */
  tightStart?: boolean
}

export function CategoryTabs({ categories, active, onSelect, tightStart }: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function checkScroll() {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    // Margen de 4px para tolerancia de subpíxeles
    setCanScrollLeft(scrollLeft > 4)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return

    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => checkScroll())
      observer.observe(el)
    }

    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
      observer?.disconnect()
    }
  }, [categories])

  // Desplazar automáticamente al chip activo cuando cambia la selección
  useEffect(() => {
    if (!active || !scrollRef.current) return
    const activeBtn = scrollRef.current.querySelector<HTMLElement>(`[data-category-id="${active}"]`)
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [active])

  function scroll(direction: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const amount = direction === 'left' ? -200 : 200
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  if (categories.length === 0) return null

  return (
    <div className="relative min-w-0 flex-1">
      {/* Flecha izquierda con degradado */}
      <div
        className={`absolute top-0 bottom-0 left-0 z-10 flex items-center pr-8 pl-1.5 bg-gradient-to-r from-surface via-surface/90 to-transparent transition-opacity duration-200 ${
          canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => scroll('left')}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/[0.08] bg-card text-ink shadow-elev-1 transition-transform hover:bg-ink/[0.04] active:scale-95"
          aria-label="Desplazar categorías hacia la izquierda"
        >
          <Icon name="chevron_left" size={18} />
        </button>
      </div>

      {/* Contenedor de scroll con los chips */}
      <div
        ref={scrollRef}
        className={`flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-hide scroll-smooth ${
          tightStart ? 'pr-4 pl-2' : 'px-4'
        }`}
      >
        {categories.map((c) => {
          const isActive = active === c.id
          return (
            <button
              key={c.id}
              type="button"
              data-category-id={c.id}
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-4 text-[13.5px] font-semibold tracking-[-0.01em] whitespace-nowrap select-none transition-all active:scale-[0.97] ${
                isActive
                  ? 'border-ink bg-ink text-white shadow-sm'
                  : 'border-ink/[0.08] bg-card text-ink-muted hover:border-ink/20 hover:bg-ink/[0.02] hover:text-ink'
              }`}
              onClick={() => onSelect(c.id)}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Flecha derecha con degradado */}
      <div
        className={`absolute top-0 right-0 bottom-0 z-10 flex items-center pr-1.5 pl-8 bg-gradient-to-l from-surface via-surface/90 to-transparent transition-opacity duration-200 ${
          canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => scroll('right')}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/[0.08] bg-card text-ink shadow-elev-1 transition-transform hover:bg-ink/[0.04] active:scale-95"
          aria-label="Desplazar categorías hacia la derecha"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
    </div>
  )
}
