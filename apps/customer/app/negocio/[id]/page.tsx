'use client'

import { getOpenStatus } from '@tindivo/contracts'
import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { CartSheet, CartSidebar } from '@/components/cart-sheet'
import { AddedToast } from '@/features/catalog/components/added-toast'
import { BusinessHero } from '@/features/catalog/components/business-hero'
import { CartReplaceSheet } from '@/features/catalog/components/cart-replace-sheet'
import { CategoryTabs } from '@/features/catalog/components/category-tabs'
import { ClosedBanner } from '@/features/catalog/components/closed-banner'
import { MenuSection } from '@/features/catalog/components/menu-section'
import { ProductModal } from '@/features/catalog/components/product-modal'
import { ScheduleRow } from '@/features/catalog/components/schedule-row'
import { useBusinessCatalog } from '@/features/catalog/hooks/use-business-catalog'
import { useCatalogCart } from '@/features/catalog/hooks/use-catalog-cart'
import { useCatalogNow } from '@/features/catalog/hooks/use-catalog-now'
import { soles } from '@/features/catalog/lib/format'

export default function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const now = useCatalogNow()
  const { data, error } = useBusinessCatalog(id)
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
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center md:max-w-[860px]">
        <p className="t-muted">{error}</p>
        <Link href="/" className="mt-3 inline-block text-sm text-brand underline">
          Volver al inicio
        </Link>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-10 md:max-w-[860px]">
        <div className="h-[280px] animate-pulse rounded-2xl bg-white" />
      </main>
    )
  }

  const { business, categories, schedule } = data
  const count = cart.count()
  const subtotal = cart.subtotal()
  const isCatalogOnly = !business.accepts_web_delivery && !business.accepts_web_pickup
  const closedForOrders = !isCatalogOnly && getOpenStatus(schedule, now).kind === 'closed'

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-32 md:max-w-[860px] lg:grid lg:max-w-7xl lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:px-6 lg:pt-6">
      <div className="lg:min-w-0">
        <BusinessHero business={business} schedule={schedule} now={now} />
        <ScheduleRow schedule={schedule} now={now} />
        {closedForOrders && <ClosedBanner schedule={schedule} now={now} />}

        <CategoryTabs categories={categories} active={active} onSelect={jumpTo} />

        <div className="px-4 pt-2">
          {categories.map((sec) => (
            <MenuSection
              key={sec.id}
              category={sec}
              disabled={closedForOrders}
              sectionRef={(el) => {
                sectionRefs.current[sec.id] = el
              }}
              onItemClick={setModalItem}
            />
          ))}
        </div>
      </div>

      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <CartSidebar businessId={business.id} businessName={business.name} />
      </aside>

      {count > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed right-4 bottom-7 left-4 z-30 mx-auto flex max-w-[736px] items-center justify-between rounded-[18px] bg-brand px-[18px] py-3.5 font-semibold text-[16px] text-white shadow-[0_12px_28px_-10px_rgba(249,115,22,0.6),0_2px_8px_rgba(0,0,0,0.1)] lg:hidden"
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
