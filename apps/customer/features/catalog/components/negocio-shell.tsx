'use client'

import { getOpenStatus } from '@tindivo/contracts'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CartSheet, CartSidebar } from '@/components/cart-sheet'
import { ActiveOrderBlockBanner } from '@/features/catalog/components/active-order-block-banner'
import { AddedToast } from '@/features/catalog/components/added-toast'
import { BusinessHero } from '@/features/catalog/components/business-hero'
import { CartReplaceSheet } from '@/features/catalog/components/cart-replace-sheet'
import { ClosedBanner } from '@/features/catalog/components/closed-banner'
import { MenuSearchResults } from '@/features/catalog/components/menu-search-results'
import { MenuSection } from '@/features/catalog/components/menu-section'
import { MenuToolbar } from '@/features/catalog/components/menu-toolbar'
import { ProductModal } from '@/features/catalog/components/product-modal'
import { ScheduleRow } from '@/features/catalog/components/schedule-row'
import { useActiveOrders } from '@/features/catalog/hooks/use-active-order'
import { useBusinessCatalog } from '@/features/catalog/hooks/use-business-catalog'
import { useCatalogCart } from '@/features/catalog/hooks/use-catalog-cart'
import { useCatalogNow } from '@/features/catalog/hooks/use-catalog-now'
import { useMenuSearch } from '@/features/catalog/hooks/use-menu-search'
import { soles } from '@/features/catalog/lib/format'
import type { BusinessDetail, Category } from '@/features/catalog/types'

interface NegocioShellProps {
  id: string
  initialData: BusinessDetail | null
}

/**
 * Referencia estable para el primer render, cuando `data` todavía es null.
 * Un `[]` nuevo en cada render invalidaría los `useMemo` de `useMenuSearch`.
 */
const SIN_CATEGORIAS: Category[] = []

export function NegocioShell({ id, initialData }: NegocioShellProps) {
  const now = useCatalogNow()
  const { data, error } = useBusinessCatalog(id, { initialData })
  const activeOrders = useActiveOrders()
  const [active, setActive] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
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

  useEffect(() => {
    if (data && !active) setActive(data.categories[0]?.id ?? '')
  }, [data, active])

  function jumpTo(sid: string) {
    setActive(sid)
    const el = sectionRefs.current[sid]
    if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' })
  }

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

  const { business, categories, schedule } = data
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
        <BusinessHero
          business={business}
          schedule={schedule}
          now={now}
          openingConfirmed={openingConfirmed}
        />
        <ScheduleRow schedule={schedule} now={now} openingConfirmed={openingConfirmed} />
        {closedForOrders && (
          <ClosedBanner schedule={schedule} now={now} openingConfirmed={openingConfirmed} />
        )}

        {/* Ancla de altura cero: marca dónde empieza la zona que la búsqueda
            sustituye, para poder devolver ahí el scroll. */}
        <div ref={search.anchorRef} aria-hidden />

        <MenuToolbar
          categories={categories}
          active={active}
          onSelect={jumpTo}
          searchEnabled={search.enabled}
          searchOpen={search.open}
          query={search.query}
          onQueryChange={search.setQuery}
          onOpenSearch={search.openSearch}
          onCloseSearch={search.closeSearch}
        />

        <div className="px-4 pt-2">
          {search.active ? (
            <MenuSearchResults
              query={search.query}
              hits={search.hits}
              businessName={business.name}
              disabled={closedForOrders || isBlockedByActiveOrder}
              onItemClick={setModalItem}
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
              />
            ))
          )}
        </div>
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
