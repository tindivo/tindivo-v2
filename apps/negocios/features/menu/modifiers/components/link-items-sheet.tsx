import { Button, Icon, IconButton } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import type { LibraryGroup, LibraryItem } from '../types'

interface LinkItemsSheetProps {
  group: LibraryGroup
  items: LibraryItem[]
  busy: boolean
  onCancel: () => void
  onSave: (itemIds: string[]) => void
}

/**
 * Elige de una vez todos los platos donde va el grupo. Es la mitad que faltaba
 * de la relación: el editor de platos la mira desde el plato ("qué grupos
 * tiene"), y desde aquí se mira desde el grupo ("en qué platos va").
 */
export function LinkItemsSheet({ group, items, busy, onCancel, onSave }: LinkItemsSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(group.itemIds))
  const [query, setQuery] = useState('')

  const byCategory = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items
    const out: { category: string; items: LibraryItem[] }[] = []
    for (const item of filtered) {
      const bucket = out.find((b) => b.category === item.categoryName)
      if (bucket) bucket.items.push(item)
      else out.push({ category: item.categoryName, items: [item] })
    }
    return out
  }, [items, query])

  function toggle(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function toggleCategory(categoryItems: LibraryItem[]) {
    const allOn = categoryItems.every((i) => selected.has(i.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const i of categoryItems) {
        if (allOn) next.delete(i.id)
        else next.add(i.id)
      }
      return next
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`¿Dónde va “${group.name}”?`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
    >
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-card max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold text-ink">¿Dónde va “{group.name}”?</h3>
            <p className="text-[12px] text-ink-muted">
              {selected.size} plato{selected.size !== 1 ? 's' : ''} seleccionado
              {selected.size !== 1 ? 's' : ''}
            </p>
          </div>
          <IconButton size="sm" onClick={onCancel} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        <div className="border-b border-ink/[0.06] p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato…"
            className="w-full rounded-xl border border-ink/[0.06] bg-card px-3 py-2 text-[14px] text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
          />
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-3.5">
          {byCategory.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Ningún plato coincide con la búsqueda.</p>
          ) : (
            byCategory.map((bucket) => (
              <div key={bucket.category} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(bucket.items)}
                  className="self-start text-[11px] font-bold text-ink-subtle uppercase tracking-wide hover:text-ink"
                >
                  {bucket.category}
                </button>
                {bucket.items.map((item) => {
                  const on = selected.has(item.id)
                  return (
                    // Fila de lista con casilla, no un botón de acción: el
                    // fondo marca la selección y `Button` le impondría forma
                    // de píldora y altura de CTA.
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                        on
                          ? 'border-brand bg-brand/[0.06]'
                          : 'border-ink/[0.06] hover:bg-ink/[0.03]'
                      }`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          on ? 'border-brand bg-brand text-white' : 'border-ink/25'
                        }`}
                      >
                        {on && <Icon name="check" size={14} />}
                      </span>
                      <span className="truncate text-[14px] font-medium text-ink">{item.name}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t border-ink/[0.06] p-3.5">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="brand"
            size="sm"
            className="flex-[2]"
            onClick={() => onSave([...selected])}
            disabled={busy}
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
