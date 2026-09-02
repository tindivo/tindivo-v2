'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import type { Category } from '@/features/catalog/types'

interface CategoryTabsProps {
  categories: Category[]
  active: string
  onSelect: (id: string) => void
}

/**
 * Tira de secciones: pestañas subrayadas, no pastillas.
 *
 * La pastilla mide ~86 px por sección y la pestaña ~64. En 390 px de ancho eso
 * es la diferencia entre ver tres secciones y ver cuatro y media — sin quitar
 * nada, solo dejando de dibujar una cápsula alrededor de cada palabra. Con las
 * catorce secciones de La Florencia, esos 22 px por sección deciden si la barra
 * es un mapa o un adorno. Es además lo que hacen las cuatro apps del gremio.
 *
 * El subrayado activo lo mueve el scroll-spy de `negocio-shell`, no el dedo:
 * si la barra no sigue a la lectura, miente, y una barra que miente se deja de
 * mirar.
 */
export function CategoryTabs({ categories, active, onSelect }: CategoryTabsProps) {
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

  // Desplazar automáticamente a la pestaña activa cuando cambia la selección
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
      {/*
        Las flechas son un patrón de escritorio y por eso solo existen ahí.
        En táctil se arrastra: nadie las toca, y su degradado ocupa justo los
        bordes donde están las pestañas — el de la derecha tapaba a medias la
        última que se alcanzaba a ver.
      */}
      <div
        className={`absolute top-0 bottom-0 left-0 z-10 hidden items-center bg-gradient-to-r from-surface via-surface/90 to-transparent pr-8 pl-1.5 transition-opacity duration-200 lg:flex ${
          canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 28 px y no los 36 del componente: la flecha va METIDA en una tira
            de pestañas de 42 px de alto, y a tamaño completo la tapa. */}
        <IconButton
          type="button"
          onClick={() => scroll('left')}
          className="h-7 w-7 border border-ink/[0.08] bg-card shadow-elev-1 hover:bg-ink/[0.04]"
          aria-label="Desplazar secciones hacia la izquierda"
        >
          <Icon name="chevron_left" size={18} />
        </IconButton>
      </div>

      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Secciones de la carta"
        className="flex items-end gap-0 overflow-x-auto pr-9 pl-2 scrollbar-hide scroll-smooth"
      >
        {categories.map((c) => {
          const isActive = active === c.id
          return (
            /*
             * EXENTA DE `check:ds`, y conviene decir por qué: el gate la marca
             * por un falso positivo. Su regla busca «fondo de marca + forma
             * redondeada» en el tag, y aquí las dos clases que la disparan
             * —`after:bg-ink` y `after:rounded-full`— pintan el SUBRAYADO de
             * 2,5 px del estado activo, no una superficie de botón. La pestaña
             * en sí no tiene fondo ninguno: es texto con un indicador debajo.
             *
             * Tampoco es un `<Button>`: es un `role="tab"` dentro de un
             * `role="tablist"`, y darle la píldora del design system rompería
             * la tira de secciones, que se lee como una fila de texto.
             */
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-category-id={c.id}
              data-active={isActive}
              className="relative inline-flex h-[42px] shrink-0 items-center px-3 text-[14px] tracking-[-0.01em] whitespace-nowrap text-ink-subtle font-medium select-none transition-colors after:absolute after:right-2 after:bottom-0 after:left-2 after:h-[2.5px] after:rounded-full after:bg-transparent after:transition-colors data-[active=true]:font-bold data-[active=true]:text-ink data-[active=true]:after:bg-ink"
              onClick={() => onSelect(c.id)}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Velo que muere DENTRO del scroll: sin él la última pestaña se corta a
          hueso contra el botón del índice y parece rota. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-11 bg-gradient-to-r from-transparent via-surface/85 to-surface"
      />

      <div
        className={`absolute top-0 right-0 bottom-0 z-10 hidden items-center bg-gradient-to-l from-surface via-surface/90 to-transparent pr-1.5 pl-8 transition-opacity duration-200 lg:flex ${
          canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <IconButton
          type="button"
          onClick={() => scroll('right')}
          className="h-7 w-7 border border-ink/[0.08] bg-card shadow-elev-1 hover:bg-ink/[0.04]"
          aria-label="Desplazar secciones hacia la derecha"
        >
          <Icon name="chevron_right" size={18} />
        </IconButton>
      </div>
    </div>
  )
}
