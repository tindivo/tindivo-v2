'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { DashboardShell } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface ModifierOption {
  id: string
  is_available: boolean
}

interface ModifierGroup {
  id: string
  options: ModifierOption[]
}

interface MenuItem {
  id: string
  name: string
  base_price: number
  is_available: boolean
  is_compact: boolean
  badges: string[]
  modifierGroups: ModifierGroup[]
}

interface MenuCategory {
  id: string
  name: string
  display_order: number
  items: MenuItem[]
}

// ── Price helpers ─────────────────────────────────────────────────────────────

function itemMinPrice(item: MenuItem): number {
  return item.base_price
}

function itemMaxPrice(item: MenuItem): number {
  // Since we don't fetch option deltas in the list view, we only show the base price
  // The editor handles full price range computation
  return item.base_price
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: MenuItem }) {
  const hasGroups = item.modifierGroups.length > 0
  const agotadoCount = item.modifierGroups.reduce(
    (n, g) => n + g.options.filter((o) => !o.is_available).length,
    0,
  )
  const minP = itemMinPrice(item)
  const maxP = itemMaxPrice(item)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--tv-border)',
        opacity: item.is_available ? 1 : 0.65,
      }}
    >
      {/* Thumbnail placeholder */}
      <div className="tv-ph" style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 10 }}>
        <span style={{ fontSize: 9 }}>{item.name.slice(0, 6).toUpperCase()}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 2,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: item.is_available ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
              textDecoration: item.is_available ? 'none' : 'line-through',
            }}
          >
            {item.name}
          </div>
          {!item.is_available && (
            <span
              style={{
                background: 'var(--tv-danger-soft)',
                color: '#991B1B',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 999,
              }}
            >
              Agotado
            </span>
          )}
        </div>

        {/* Price + complexity badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            className="tv-mono"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--tv-ink)' }}
          >
            {minP === maxP ? soles(minP) : `${soles(minP)} – ${soles(maxP)}`}
          </span>
          {hasGroups ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#E0F2FE',
                color: '#0369A1',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              <MS name="tune" size={10} />
              {item.modifierGroups.length} grupo{item.modifierGroups.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--tv-success-soft)',
                color: '#166534',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              <MS name="shopping_cart" size={10} />
              Directo al carrito
            </span>
          )}
          {agotadoCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--tv-warning)',
                fontWeight: 600,
              }}
            >
              {agotadoCount} opción{agotadoCount > 1 ? 'es' : ''} agotada
              {agotadoCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Edit button — always visible */}
      <Link
        href={`/menu/item/${item.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '7px 10px',
          borderRadius: 10,
          background: 'rgba(26,22,20,0.06)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--tv-ink)',
          flexShrink: 0,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        <MS name="edit" size={15} />
        Editar
      </Link>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ cat }: { cat: MenuCategory }) {
  const unavailable = cat.items.filter((i) => !i.is_available).length
  const withGroups = cat.items.filter((i) => i.modifierGroups.length > 0).length

  return (
    <div id={`cat-${cat.id}`} style={{ marginBottom: 20, scrollMarginTop: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 4px 8px',
        }}
      >
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--tv-ink)' }}>
          {cat.name}
        </div>
        <span className="tv-chip" style={{ fontSize: 11 }}>
          {cat.items.length}
        </span>
        {withGroups > 0 && (
          <span
            style={{
              background: '#E0F2FE',
              color: '#0369A1',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
            }}
          >
            {withGroups} con opciones
          </span>
        )}
        {unavailable > 0 && (
          <span className="tv-chip tv-chip-warning" style={{ fontSize: 10 }}>
            {unavailable} agotado{unavailable > 1 ? 's' : ''}
          </span>
        )}
        <Link
          href={`/menu/item/nuevo?cat=${cat.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 10,
            background: 'var(--tv-brand)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <MS name="add" size={14} />
          Plato
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cat.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px',
        background: '#fff',
        borderRadius: 20,
        border: '2px dashed var(--tv-border)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'var(--tv-brand-soft)',
          color: 'var(--tv-brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <MS name="restaurant_menu" size={36} />
      </div>
      <div className="tv-display" style={{ fontSize: 22, marginBottom: 8 }}>
        Tu menú está vacío
      </div>
      <div
        style={{
          fontSize: 14,
          color: 'var(--tv-ink-muted)',
          maxWidth: 300,
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        Agrega tus platos para que los clientes puedan pedirlos. Puedes empezar con bebidas y platos
        simples.
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          maxWidth: 280,
          marginBottom: 24,
        }}
      >
        {(
          [
            { icon: 'looks_one', text: 'Crea una categoría (ej. "Pizzas")' },
            { icon: 'looks_two', text: 'Agrega platos con precio' },
            { icon: 'looks_3', text: 'Actívalos para que aparezcan online' },
          ] as const
        ).map((tip) => (
          <div
            key={tip.icon}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--tv-surface)',
              borderRadius: 10,
              padding: '8px 12px',
              textAlign: 'left',
            }}
          >
            <MS
              name={tip.icon}
              size={18}
              filled
              style={{ color: 'var(--tv-brand)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13 }}>{tip.text}</span>
          </div>
        ))}
      </div>

      <Link
        href="/menu/item/nuevo"
        className="tv-btn tv-btn-brand tv-btn-lg"
        style={{ textDecoration: 'none' }}
      >
        <MS name="add" size={20} filled />
        Agregar el primer plato
      </Link>
    </div>
  )
}

// ── Desktop left rail ─────────────────────────────────────────────────────────

function DesktopCategoryRail({
  cats,
  activeCatId,
  onCatClick,
}: {
  cats: MenuCategory[]
  activeCatId: string | null
  onCatClick: (id: string) => void
}) {
  const withGroups = cats.flatMap((c) => c.items).filter((i) => i.modifierGroups.length > 0).length
  const totalItems = cats.flatMap((c) => c.items).length

  return (
    <aside
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 14,
        border: '1px solid var(--tv-border)',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
      }}
    >
      <div className="tv-label" style={{ marginBottom: 8, padding: '0 4px' }}>
        CATEGORÍAS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {cats.map((cat, i) => {
          const isActive = activeCatId === cat.id || (activeCatId === null && i === 0)
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCatClick(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                background: isActive ? 'var(--tv-ink)' : 'transparent',
                color: isActive ? '#fff' : 'var(--tv-ink)',
                border: 'none',
                fontFamily: 'inherit',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{cat.name}</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(26,22,20,0.08)',
                  padding: '2px 7px',
                  borderRadius: 999,
                }}
              >
                {cat.items.length}
              </span>
            </button>
          )
        })}
      </div>

      <Link
        href="/menu/item/nuevo"
        className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block"
        style={{ marginTop: 10, textDecoration: 'none' }}
      >
        <MS name="add" size={14} />
        Nuevo plato
      </Link>

      {/* Legend */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid var(--tv-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div className="tv-label" style={{ fontSize: 9 }}>
          LEYENDA
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: '#E0F2FE',
              color: '#0369A1',
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            <MS name="tune" size={10} />
            Con opciones
          </span>
          <span style={{ color: 'var(--tv-ink-muted)' }}>grupos de modificadores</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: 'var(--tv-success-soft)',
              color: '#166534',
              padding: '2px 6px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            <MS name="shopping_cart" size={10} />
            Directo
          </span>
          <span style={{ color: 'var(--tv-ink-muted)' }}>va al carrito sin modal</span>
        </div>
        {cats.length > 0 && (
          <div
            style={{ marginTop: 4, fontSize: 11, color: 'var(--tv-ink-muted)', lineHeight: 1.4 }}
          >
            {withGroups} con opciones · {totalItems - withGroups} directos
          </div>
        )}
      </div>
    </aside>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const router = useRouter()
  const [cats, setCats] = useState<MenuCategory[]>([])
  const [_bizId, setBizId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [activeCatId, setActiveCatId] = useState<string | null>(null)

  const load = useCallback(async (businessId: string) => {
    const supabase = getSupabaseBrowser()

    const [{ data: categories }, { data: items }, { data: junctions }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,display_order')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select('id,category_id,name,base_price,is_available,is_compact,badges,display_order')
        .eq('business_id', businessId)
        .order('display_order'),
      supabase.from('menu_item_modifier_groups').select('item_id,group_id'),
    ])

    // Fetch option availability per group for agotado count
    const groupIds = (junctions ?? []).map((j) => j.group_id)
    const { data: options } =
      groupIds.length > 0
        ? await supabase
            .from('menu_modifier_options')
            .select('id,group_id,is_available')
            .in('group_id', groupIds)
        : { data: [] }

    const optionsByGroup: Record<string, { id: string; is_available: boolean }[]> = {}
    for (const opt of options ?? []) {
      const list = optionsByGroup[opt.group_id] ?? []
      list.push({ id: opt.id, is_available: opt.is_available })
      optionsByGroup[opt.group_id] = list
    }

    // Build groups per item
    const groupsByItem: Record<string, ModifierGroup[]> = {}
    for (const j of junctions ?? []) {
      const list = groupsByItem[j.item_id] ?? []
      list.push({
        id: j.group_id,
        options: optionsByGroup[j.group_id] ?? [],
      })
      groupsByItem[j.item_id] = list
    }

    setCats(
      (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        display_order: c.display_order,
        items: (items ?? [])
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            name: i.name,
            base_price: Number(i.base_price),
            is_available: i.is_available,
            is_compact: i.is_compact,
            badges: i.badges ?? [],
            modifierGroups: groupsByItem[i.id] ?? [],
          })),
      })),
    )
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      const { data: biz } = await supabase.from('businesses').select('id').maybeSingle()
      if (biz?.id) {
        setBizId(biz.id)
        await load(biz.id)
      }
      setReady(true)
    })
  }, [router, load])

  const totalItems = cats.flatMap((c) => c.items).length
  const unavailableTotal = cats.flatMap((c) => c.items).filter((i) => !i.is_available).length
  const withGroupsTotal = cats
    .flatMap((c) => c.items)
    .filter((i) => i.modifierGroups.length > 0).length

  function handleCatClick(id: string) {
    setActiveCatId(id)
    const el = document.getElementById(`cat-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const subtitle =
    ready && cats.length > 0
      ? `${totalItems} plato${totalItems !== 1 ? 's' : ''} · ${unavailableTotal} agotado${unavailableTotal !== 1 ? 's' : ''} · ${withGroupsTotal} con grupos`
      : undefined

  const headerRight = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Link
        href="/menu/item/nuevo"
        className="tv-btn tv-btn-brand tv-btn-sm"
        style={{ textDecoration: 'none' }}
      >
        <MS name="add" size={16} />
        Nuevo plato
      </Link>
    </div>
  )

  return (
    <DashboardShell active="menu" title="Menú" subtitle={subtitle} headerRight={headerRight}>
      {!ready ? (
        <div style={{ color: 'var(--tv-ink-muted)', fontSize: 14, padding: '20px 0' }}>
          Cargando…
        </div>
      ) : cats.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Mobile: legend strip */}
          <div className="lg:hidden flex" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#E0F2FE',
                color: '#0369A1',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              <MS name="tune" size={10} />
              {withGroupsTotal} con opciones
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--tv-success-soft)',
                color: '#166534',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              <MS name="shopping_cart" size={10} />
              {totalItems - withGroupsTotal} directos al carrito
            </span>
          </div>

          {/* Mobile: categories list */}
          <div className="lg:hidden">
            {cats.map((cat) => (
              <CategorySection key={cat.id} cat={cat} />
            ))}
          </div>

          {/* Desktop: 2-col layout */}
          <div
            className="hidden lg:grid"
            style={{ gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'flex-start' }}
          >
            <DesktopCategoryRail
              cats={cats}
              activeCatId={activeCatId}
              onCatClick={handleCatClick}
            />
            <div>
              {cats.map((cat) => (
                <CategorySection key={cat.id} cat={cat} />
              ))}
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  )
}
