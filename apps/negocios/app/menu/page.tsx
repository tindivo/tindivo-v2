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
  imageUrl: string | null
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
      {/* Thumbnail */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 10, objectFit: 'cover' }}
        />
      ) : (
        <div className="tv-ph" style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 10 }}>
          <span style={{ fontSize: 9 }}>{item.name.slice(0, 6).toUpperCase()}</span>
        </div>
      )}

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

function EmptyState({ onCreateCategory }: { onCreateCategory: () => void }) {
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

      <button type="button" onClick={onCreateCategory} className="tv-btn tv-btn-brand tv-btn-lg">
        <MS name="add" size={20} filled />
        Crear categoría
      </button>
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

// ── Category manager (CRUD directo a Supabase, RLS mc_owner_all) ───────────────

interface CatRow {
  id: string
  name: string
  blurb: string
  display_order: number
  is_active: boolean
  itemCount: number
}

function CategoryManagerModal({
  open,
  bizId,
  onClose,
  onChanged,
}: {
  open: boolean
  bizId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<CatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CatRow | null>(null)

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    setLoading(true)
    setError(null)
    const [{ data: catData, error: catErr }, { data: itemData }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,blurb,display_order,is_active')
        .eq('business_id', bizId)
        .order('display_order'),
      supabase.from('menu_items').select('category_id').eq('business_id', bizId),
    ])
    if (catErr) {
      setError(catErr.message)
      setLoading(false)
      return
    }
    const counts: Record<string, number> = {}
    for (const it of itemData ?? []) counts[it.category_id] = (counts[it.category_id] ?? 0) + 1
    setRows(
      (catData ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        blurb: c.blurb ?? '',
        display_order: c.display_order,
        is_active: c.is_active,
        itemCount: counts[c.id] ?? 0,
      })),
    )
    setLoading(false)
  }, [bizId])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  if (!open) return null

  async function persist(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ): Promise<void> {
    setBusy(true)
    setError(null)
    const { error: e } = await fn()
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    await reload()
    onChanged()
  }

  async function addCategory() {
    const supabase = getSupabaseBrowser()
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0
    await persist(() =>
      supabase.from('menu_categories').insert({
        business_id: bizId,
        name: 'Nueva categoría',
        display_order: nextOrder,
        is_active: true,
      }),
    )
  }

  async function saveName(row: CatRow, name: string) {
    if (name.trim() === row.name) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ name: name.trim() || 'Sin nombre' })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function saveBlurb(row: CatRow, blurb: string) {
    if (blurb.trim() === row.blurb) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ blurb: blurb.trim() || null })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function toggleActive(row: CatRow) {
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ is_active: !row.is_active })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir
    if (other < 0 || other >= rows.length) return
    const newRows = [...rows]
    const a = newRows[index]
    const b = newRows[other]
    if (!a || !b) return
    newRows[index] = b
    newRows[other] = a
    const supabase = getSupabaseBrowser()
    setBusy(true)
    setError(null)
    for (let i = 0; i < newRows.length; i++) {
      const r = newRows[i]
      if (r && r.display_order !== i) {
        const { error: e } = await supabase
          .from('menu_categories')
          .update({ display_order: i })
          .eq('id', r.id)
          .eq('business_id', bizId)
        if (e) {
          setError(e.message)
          setBusy(false)
          return
        }
      }
    }
    setBusy(false)
    await reload()
    onChanged()
  }

  async function doDelete(row: CatRow) {
    setConfirmDelete(null)
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase.from('menu_categories').delete().eq('id', row.id).eq('business_id', bizId),
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--tv-border)',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>Gestionar categorías</div>
          <button
            type="button"
            onClick={onClose}
            className="tv-btn tv-btn-ghost tv-btn-sm"
            aria-label="Cerrar"
          >
            <MS name="close" size={18} />
          </button>
        </div>

        <div
          style={{
            padding: 14,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {error && (
            <div style={{ fontSize: 12, color: 'var(--tv-danger)', fontWeight: 600 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ color: 'var(--tv-ink-muted)', fontSize: 14 }}>Cargando…</div>
          ) : rows.length === 0 ? (
            <div style={{ color: 'var(--tv-ink-muted)', fontSize: 14 }}>
              Aún no tenés categorías. Agregá la primera para empezar tu menú.
            </div>
          ) : (
            rows.map((row, index) => (
              <div
                key={row.id}
                style={{
                  border: '1px solid var(--tv-border)',
                  borderRadius: 12,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  opacity: row.is_active ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={busy || index === 0}
                      aria-label="Subir"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      <MS
                        name="keyboard_arrow_up"
                        size={18}
                        style={{ color: 'var(--tv-ink-muted)' }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={busy || index === rows.length - 1}
                      aria-label="Bajar"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      <MS
                        name="keyboard_arrow_down"
                        size={18}
                        style={{ color: 'var(--tv-ink-muted)' }}
                      />
                    </button>
                  </div>
                  <input
                    className="tv-input"
                    style={{ flex: 1, fontSize: 14, fontWeight: 600 }}
                    defaultValue={row.name}
                    onBlur={(e) => saveName(row, e.target.value)}
                    placeholder="Nombre de la categoría"
                  />
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    disabled={busy}
                    className="tv-btn tv-btn-ghost tv-btn-sm"
                    title={row.is_active ? 'Ocultar del menú' : 'Mostrar en el menú'}
                  >
                    <MS name={row.is_active ? 'visibility' : 'visibility_off'} size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(row)}
                    disabled={busy}
                    className="tv-btn tv-btn-ghost tv-btn-sm"
                    aria-label="Eliminar categoría"
                    style={{ color: 'var(--tv-danger)' }}
                  >
                    <MS name="delete" size={16} />
                  </button>
                </div>
                <input
                  className="tv-input"
                  style={{ fontSize: 12 }}
                  defaultValue={row.blurb}
                  onBlur={(e) => saveBlurb(row, e.target.value)}
                  placeholder="Descripción corta (opcional)"
                />
                <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>
                  {row.itemCount} plato{row.itemCount !== 1 ? 's' : ''}
                  {!row.is_active && ' · oculta'}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 14, borderTop: '1px solid var(--tv-border)' }}>
          <button
            type="button"
            onClick={addCategory}
            disabled={busy}
            className="tv-btn tv-btn-brand tv-btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <MS name="add" size={16} /> Agregar categoría
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 18,
              maxWidth: 380,
              width: '100%',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              Eliminar “{confirmDelete.name}”
            </div>
            <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginBottom: 16 }}>
              {confirmDelete.itemCount > 0
                ? `Se eliminarán también ${confirmDelete.itemCount} plato${confirmDelete.itemCount !== 1 ? 's' : ''} de esta categoría. Esta acción no se puede deshacer.`
                : 'Esta acción no se puede deshacer.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="tv-btn tv-btn-ghost tv-btn-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => doDelete(confirmDelete)}
                className="tv-btn tv-btn-sm"
                style={{ background: 'var(--tv-danger)', color: '#fff' }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MenuPage() {
  const router = useRouter()
  const [cats, setCats] = useState<MenuCategory[]>([])
  const [bizId, setBizId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [catManagerOpen, setCatManagerOpen] = useState(false)

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
        .select(
          'id,category_id,name,base_price,is_available,is_compact,badges,image_url,display_order',
        )
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
            imageUrl: i.image_url ?? null,
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
      <button
        type="button"
        onClick={() => setCatManagerOpen(true)}
        className="tv-btn tv-btn-ghost tv-btn-sm"
      >
        <MS name="category" size={16} />
        Categorías
      </button>
    </div>
  )

  return (
    <DashboardShell active="menu" title="Menú" subtitle={subtitle} headerRight={headerRight}>
      {!ready ? (
        <div style={{ color: 'var(--tv-ink-muted)', fontSize: 14, padding: '20px 0' }}>
          Cargando…
        </div>
      ) : cats.length === 0 ? (
        <EmptyState onCreateCategory={() => setCatManagerOpen(true)} />
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
      {bizId && (
        <CategoryManagerModal
          open={catManagerOpen}
          bizId={bizId}
          onClose={() => setCatManagerOpen(false)}
          onChanged={() => load(bizId)}
        />
      )}
    </DashboardShell>
  )
}
