'use client'

import { getOpenStatus } from '@tindivo/contracts'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CartSheet, CartSidebar } from '@/components/cart-sheet'
import { ActiveOrderBlockBanner } from '@/features/catalog/components/active-order-block-banner'
import { AddedToast } from '@/features/catalog/components/added-toast'
import { BusinessHero } from '@/features/catalog/components/business-hero'
import { BusinessIdentity } from '@/features/catalog/components/business-identity'
import { CartReplaceSheet } from '@/features/catalog/components/cart-replace-sheet'
import { ClosedBanner } from '@/features/catalog/components/closed-banner'
import { MenuSearchResults } from '@/features/catalog/components/menu-search-results'
import { MenuSection } from '@/features/catalog/components/menu-section'
import { MenuToolbar } from '@/features/catalog/components/menu-toolbar'
import { ProductModal } from '@/features/catalog/components/product-modal'
import { SearchSuggestions } from '@/features/catalog/components/search-suggestions'
import { SectionIndexSheet } from '@/features/catalog/components/section-index-sheet'
import { useBusinessCatalog } from '@/features/catalog/hooks/use-business-catalog'
import { useCatalogCart } from '@/features/catalog/hooks/use-catalog-cart'
import { useCatalogNow } from '@/features/catalog/hooks/use-catalog-now'
import { useMenuSearch } from '@/features/catalog/hooks/use-menu-search'
import { soles } from '@/features/catalog/lib/format'
import { plainLine } from '@/features/catalog/lib/menu-density'
import type { BusinessDetail, Category, MenuItem } from '@/features/catalog/types'
import { useActiveOrders } from '@/lib/active-orders'

interface NegocioShellProps {
  id: string
  initialData: BusinessDetail | null
}

/**
 * Referencia estable para el primer render, cuando `data` todavía es null.
 * Un `[]` nuevo en cada render invalidaría los `useMemo` de `useMenuSearch`.
 */
const SIN_CATEGORIAS: Category[] = []

/** Alto de reserva mientras no se ha podido medir la barra fija. */
const ALTO_BARRA_ESTIMADO = 96

/**
 * Cuánto callar al scroll-spy tras un salto. Con `behavior: 'smooth'` el
 * navegador atraviesa las secciones intermedias, y sin esta pausa el subrayado
 * las va encendiendo una a una: parpadea toda la tira antes de asentarse.
 */
const MS_DE_SALTO = 700

export function NegocioShell({ id, initialData }: NegocioShellProps) {
  const now = useCatalogNow()
  const { data, error } = useBusinessCatalog(id, { initialData })
  const activeOrders = useActiveOrders()
  const [active, setActive] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [pendingJump, setPendingJump] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const jumpingUntil = useRef(0)
  const {
    cart,
    modalItem,
    setModalItem,
    pending,
    setPending,
    addedToast,
    handleAdd,
    confirmReplace,
  } = useCatalogCart(data?.business.id, data?.business.name)
  const search = useMenuSearch(data?.categories ?? SIN_CATEGORIAS)
  const isBlockedByActiveOrder = activeOrders.some((o) => o.businessId === id)
  const categories = data?.categories ?? SIN_CATEGORIAS
  const searchReplacing = search.replacing

  useEffect(() => {
    if (data && !active) setActive(data.categories[0]?.id ?? '')
  }, [data, active])

  /**
   * Scroll-spy: el subrayado sigue a la lectura.
   *
   * Antes `active` solo cambiaba al tocar una pestaña, así que en una carta de
   * catorce secciones la barra seguía marcando la primera mientras el usuario
   * recorría las otras trece. Una barra que miente se deja de mirar, y con ella
   * se pierden las secciones — que era el síntoma que había que resolver.
   *
   * No corre mientras la búsqueda ocupa el sitio de la carta: ahí abajo no hay
   * secciones que espiar.
   */
  useEffect(() => {
    if (searchReplacing || categories.length === 0) return
    let frame = 0

    function espiar() {
      frame = 0
      if (Date.now() < jumpingUntil.current) return
      const guard = (toolbarRef.current?.offsetHeight ?? ALTO_BARRA_ESTIMADO) + 12
      let current = categories[0]?.id ?? ''
      for (const c of categories) {
        const el = sectionRefs.current[c.id]
        if (el && el.getBoundingClientRect().top <= guard) current = c.id
      }
      if (current) setActive((prev) => (prev === current ? prev : current))
    }

    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(espiar)
    }

    espiar()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [categories, searchReplacing])

  /**
   * El salto se hace en un efecto y no en el handler porque puede venir desde
   * las sugerencias, y entonces la carta todavía no está montada: en el handler
   * la sección a la que queremos ir aún no existe.
   */
  useEffect(() => {
    if (!pendingJump) return
    const el = sectionRefs.current[pendingJump]
    setPendingJump(null)
    if (!el) return
    const guard = toolbarRef.current?.offsetHeight ?? ALTO_BARRA_ESTIMADO
    jumpingUntil.current = Date.now() + MS_DE_SALTO
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - guard,
      behavior: 'smooth',
    })
  }, [pendingJump])

  /**
   * Añadir sin abrir el detalle. Solo lo llaman los platos SIN opciones: el
   * «+» de una gaseosa no tiene nada que preguntar, y hasta ahora abría un
   * modal en el que lo único posible era volver a pulsar «Agregar».
   */
  const quickAdd = useCallback((item: MenuItem) => handleAdd(plainLine(item)), [handleAdd])

  const jumpTo = useCallback(
    (sid: string) => {
      setActive(sid)
      setIndexOpen(false)
      // Suelta el scroll guardado: si no, al cerrar la búsqueda el usuario
      // volvería donde estaba antes de buscar y el salto se desharía solo.
      search.closeForJump()
      setPendingJump(sid)
    },
    [search.closeForJump],
  )

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col items-center justify-center px-4 text-center md:max-w-[860px]">
        <p className="text-ink-muted">{error}</p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand underline">
          Volver al inicio
        </Link>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-10 md:max-w-[860px]">
        <div className="h-[280px] animate-pulse rounded-2xl bg-card" />
      </main>
    )
  }

  const { business, schedule } = data
  const openingConfirmed = data.opening_confirmed ?? null
  const isCurrentBusinessCart = cart.businessId === business.id
  const count = isCurrentBusinessCart ? cart.count() : 0
  const subtotal = isCurrentBusinessCart ? cart.subtotal() : 0
  const isCatalogOnly = !business.accepts_web_delivery && !business.accepts_web_pickup
  const closedForOrders =
    !isCatalogOnly && getOpenStatus(schedule, now, openingConfirmed).kind === 'closed'

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-32 md:max-w-[860px] lg:grid lg:max-w-7xl lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:px-6 lg:pt-6">
      <div className="lg:min-w-0">
        {isBlockedByActiveOrder && (
          <ActiveOrderBlockBanner
            orders={activeOrders.filter((o) => o.businessId === id)}
            businessName={business.name}
          />
        )}
        <BusinessHero business={business} />
        <BusinessIdentity
          business={business}
          schedule={schedule}
          now={now}
          openingConfirmed={openingConfirmed}
        />
        {closedForOrders && (
          <ClosedBanner schedule={schedule} now={now} openingConfirmed={openingConfirmed} />
        )}

        {/* Ancla de altura cero: marca dónde empieza la zona que la búsqueda
            sustituye, para poder devolver ahí el scroll. */}
        <div ref={search.anchorRef} aria-hidden />

        <MenuToolbar
          containerRef={toolbarRef}
          categories={categories}
          businessName={business.name}
          active={active}
          onSelect={jumpTo}
          onOpenIndex={() => setIndexOpen(true)}
          searchEnabled={search.enabled}
          searchActive={searchReplacing}
          query={search.query}
          onQueryChange={search.setQuery}
          onSearchFocus={search.onFocus}
          onSearchBlur={search.onBlur}
          onSearchClear={search.clear}
        />

        {search.suggesting && <SearchSuggestions categories={categories} onSelect={jumpTo} />}

        {!search.suggesting && (
          <div className="px-4 pt-2">
            {search.active ? (
              <MenuSearchResults
                query={search.query}
                hits={search.hits}
                businessName={business.name}
                disabled={closedForOrders || isBlockedByActiveOrder}
                onItemClick={setModalItem}
                onQuickAdd={quickAdd}
              />
            ) : (
              categories.map((sec) => (
                <MenuSection
                  key={sec.id}
                  category={sec}
                  disabled={closedForOrders || isBlockedByActiveOrder}
                  sectionRef={(el) => {
                    sectionRefs.current[sec.id] = el
                  }}
                  onItemClick={setModalItem}
                  onQuickAdd={quickAdd}
                />
              ))
            )}
          </div>
        )}
      </div>

      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <CartSidebar businessId={business.id} businessName={business.name} />
      </aside>

      {count > 0 && !isBlockedByActiveOrder && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed right-4 bottom-7 left-4 z-30 mx-auto flex max-w-[736px] items-center justify-between rounded-[18px] bg-brand px-[18px] py-3.5 font-semibold text-[16px] text-white shadow-glow-brand-lg lg:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.22] font-bold text-[13px]">
              {count}
            </span>
            Ver mi bolsa
          </span>
          <span className="tabular-nums">{soles(subtotal)}</span>
        </button>
      )}

      {indexOpen && (
        <SectionIndexSheet
          categories={categories}
          onSelect={jumpTo}
          onClose={() => setIndexOpen(false)}
        />
      )}

      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} />}

      {modalItem && (
        <ProductModal item={modalItem} onClose={() => setModalItem(null)} onAdd={handleAdd} />
      )}

      {pending && (
        <CartReplaceSheet
          currentBusinessName={cart.businessName}
          newBusinessName={business.name}
          pending={pending}
          onClose={() => setPending(null)}
          onConfirm={confirmReplace}
        />
      )}

      {addedToast && <AddedToast key={addedToast.id} name={addedToast.name} />}
    </main>
  )
}
