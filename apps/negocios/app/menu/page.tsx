'use client'

import { Button, Icon, IconButton, LoadingState } from '@tindivo/ui'
import { useEffect, useMemo, useState } from 'react'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(false)

  const totalItems = cats.flatMap((c) => c.items).length
  const unavailableTotal = cats.flatMap((c) => c.items).filter((i) => !i.is_available).length
  const withGroupsTotal = cats
    .flatMap((c) => c.items)
    .filter((i) => i.modifierGroups.length > 0).length

  // Filtrado de platos por texto de búsqueda en tiempo real
  const filteredCats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return cats

    return cats
      .map((cat) => {
        const catNameMatches = cat.name.toLowerCase().includes(q)
        const matchingItems = cat.items.filter((item) => {
          if (catNameMatches) return true
          if (item.name.toLowerCase().includes(q)) return true
          if (item.badges?.some((b) => b.toLowerCase().includes(q))) return true
          return false
        })
        return {
          ...cat,
          items: matchingItems,
        }
      })
      .filter((cat) => cat.items.length > 0)
  }, [cats, searchQuery])

  const totalFilteredItems = filteredCats.flatMap((c) => c.items).length

  function handleCatClick(id: string) {
    setActiveCatId(id)
    const el = document.getElementById(`cat-${id}`)
    if (!el) return
    const mainEl = document.querySelector('main')
    if (mainEl) {
      const mainRect = mainEl.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const targetScroll = mainEl.scrollTop + (elRect.top - mainRect.top) - 16
      mainEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Resalta automáticamente la categoría activa al desplazarse por el menú (scroll spy)
  useEffect(() => {
    if (!ready || filteredCats.length === 0) return

    const mainEl = document.querySelector('main')
    if (!mainEl) return

    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const mainRect = mainEl.getBoundingClientRect()
        const triggerY = mainRect.top + 100

        let currentId = filteredCats[0]?.id ?? null

        for (const cat of filteredCats) {
          const el = document.getElementById(`cat-${cat.id}`)
          if (!el) continue
          const rect = el.getBoundingClientRect()
          if (rect.top <= triggerY) {
            currentId = cat.id
          }
        }

        if (currentId) {
          setActiveCatId(currentId)
        }
      })
    }

    mainEl.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      mainEl.removeEventListener('scroll', handleScroll)
    }
  }, [ready, filteredCats])

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
          {/* Buscador de platos y categorías */}
          <div className="mb-4">
            <div className="relative flex items-center">
              <Icon
                name="search"
                size={18}
                className="pointer-events-none absolute left-3.5 text-ink-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar plato o categoría (ej. pizza, hamburguesa)..."
                className="h-11 w-full rounded-2xl border border-ink/[0.08] bg-card pl-10 pr-10 text-sm text-ink placeholder:text-ink/40 shadow-elev-1 transition-all focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              {searchQuery && (
                <IconButton
                  type="button"
                  variant="filled"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 h-6 w-6 text-ink-muted hover:text-ink"
                  aria-label="Limpiar búsqueda"
                >
                  <Icon name="close" size={14} />
                </IconButton>
              )}
            </div>
            {searchQuery && (
              <div className="mt-2 flex items-center justify-between px-1 text-xs text-ink-muted">
                <span>
                  {totalFilteredItems === 0
                    ? 'No se encontraron resultados'
                    : `${totalFilteredItems} plato${totalFilteredItems !== 1 ? 's' : ''} encontrado${totalFilteredItems !== 1 ? 's' : ''}`}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="font-semibold text-brand hover:underline"
                >
                  Ver todo el menú
                </button>
              </div>
            )}
          </div>

          {/* Badges de resumen en móvil */}
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

          {/* Barra de categorías horizontal en móvil.
              Excepción a check:ds — riel de chips de categoría, no botones sueltos.
              La superficie `bg-ink` marca CUÁL está activo dentro de una fila que
              scrollea; `<Button>` traería su propio alto y su degradado de marca, y
              el riel dejaría de leerse como una sola cosa. */}
          {filteredCats.length > 1 && (
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
              {filteredCats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCatClick(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                    activeCatId === cat.id
                      ? 'bg-ink text-white shadow-sm'
                      : 'border border-ink/[0.08] bg-card text-ink hover:bg-surface'
                  }`}
                >
                  {cat.name} ({cat.items.length})
                </button>
              ))}
            </div>
          )}

          {/* Rejilla de menú */}
          <div className="lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-5">
            <div className="hidden lg:block">
              <DesktopCategoryRail
                cats={filteredCats}
                activeCatId={activeCatId}
                onCatClick={handleCatClick}
              />
            </div>

            <div>
              {filteredCats.length === 0 && searchQuery ? (
                <div className="my-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 bg-card p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-low text-ink-muted">
                    <Icon name="search_off" size={24} />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-ink">No hay platos que coincidan</h3>
                  <p className="mt-1 max-w-sm text-xs text-ink-muted">
                    No encontramos ningún plato o categoría con el término "{searchQuery}".
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="mt-4 gap-1.5"
                  >
                    <Icon name="close" size={14} />
                    Limpiar búsqueda
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredCats.map((cat) => (
                    <CategorySection
                      key={cat.id}
                      cat={cat}
                      onToggleAvailability={toggleItemAvailability}
                    />
                  ))}
                </div>
              )}
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
