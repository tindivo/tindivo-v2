'use client'

import { Button, Icon, LoadingState } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { CategoryManagerModal } from '@/features/menu/components/category-manager-modal'
import { CategorySection } from '@/features/menu/components/category-section'
import { DesktopCategoryRail } from '@/features/menu/components/desktop-category-rail'
import { EmptyState } from '@/features/menu/components/empty-state'
import { useMenu } from '@/features/menu/hooks/use-menu'
import { ModifierLibraryModal } from '@/features/menu/modifiers/components/modifier-library-modal'

export default function MenuPage() {
  const { cats, bizId, ready, reload, toggleItemAvailability } = useMenu()
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(false)

  const totalItems = cats.flatMap((c) => c.items).length
  const unavailableTotal = cats.flatMap((c) => c.items).filter((i) => !i.is_available).length
  const withGroupsTotal = cats
    .flatMap((c) => c.items)
    .filter((i) => i.modifierGroups.length > 0).length

  function handleCatClick(id: string) {
    setActiveCatId(id)
    const el = document.getElementById(`cat-${id}`)
    if (!el) return
    const container = el.closest('main')
    if (container) {
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const currentScroll = container.scrollTop
      const targetScroll = currentScroll + (elRect.top - containerRect.top) - 12
      container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Resalta automáticamente la categoría activa en el panel lateral al desplazarse por el menú
  useEffect(() => {
    if (!ready || cats.length === 0) return

    const mainEl = document.querySelector('main')
    if (!mainEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const catId = entry.target.id.replace('cat-', '')
            setActiveCatId(catId)
          }
        }
      },
      {
        root: mainEl,
        rootMargin: '-5% 0px -75% 0px',
        threshold: 0,
      },
    )

    cats.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [ready, cats])

  const subtitle =
    ready && cats.length > 0
      ? `${totalItems} plato${totalItems !== 1 ? 's' : ''} · ${unavailableTotal} agotado${unavailableTotal !== 1 ? 's' : ''} · ${withGroupsTotal} con grupos`
      : undefined

  const headerRight = (
    <div className="flex items-center gap-1.5">
      <Button
        variant="soft"
        size="sm"
        className="gap-1.5 text-[13px]"
        onClick={() => setExtrasOpen(true)}
      >
        <Icon name="tune" size={16} />
        Extras
      </Button>
      <Button
        variant="soft"
        size="sm"
        className="gap-1.5 text-[13px]"
        onClick={() => setCatManagerOpen(true)}
      >
        <Icon name="category" size={16} />
        Categorías
      </Button>
    </div>
  )

  return (
    <DashboardShell active="menu" title="Menú" subtitle={subtitle} headerRight={headerRight}>
      {!ready ? (
        <LoadingState
          variant="card"
          label="Cargando menú del restaurante…"
          icon="restaurant_menu"
          className="my-8"
        />
      ) : cats.length === 0 ? (
        <EmptyState onCreateCategory={() => setCatManagerOpen(true)} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 lg:hidden">
            <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-1 text-[10px] font-bold text-info">
              <Icon name="tune" size={10} />
              {withGroupsTotal} con opciones
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-bold text-success">
              <Icon name="shopping_cart" size={10} />
              {totalItems - withGroupsTotal} directos al carrito
            </span>
          </div>

          <div className="flex flex-col gap-1 lg:hidden">
            {cats.map((cat) => (
              <CategorySection
                key={cat.id}
                cat={cat}
                onToggleAvailability={toggleItemAvailability}
              />
            ))}
          </div>

          <div className="hidden grid-cols-[240px_1fr] items-start gap-5 lg:grid">
            <DesktopCategoryRail
              cats={cats}
              activeCatId={activeCatId}
              onCatClick={handleCatClick}
            />
            <div>
              {cats.map((cat) => (
                <CategorySection
                  key={cat.id}
                  cat={cat}
                  onToggleAvailability={toggleItemAvailability}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {bizId && (
        <>
          <CategoryManagerModal
            open={catManagerOpen}
            bizId={bizId}
            onClose={() => setCatManagerOpen(false)}
            onChanged={() => reload(bizId)}
          />
          <ModifierLibraryModal
            open={extrasOpen}
            bizId={bizId}
            onClose={() => setExtrasOpen(false)}
            onChanged={() => reload(bizId)}
          />
        </>
      )}
    </DashboardShell>
  )
}
