'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { BoardOrder } from '@/lib/types'

function minutesFromNow(iso: string | null, now: number): string {
  if (!iso) return 'En cocina'
  const diffMs = Date.parse(iso) - now
  const mins = Math.max(1, Math.round(diffMs / 60_000))
  return `En ~${mins} min`
}

/**
 * Sección colapsable de "Próximos pedidos" (cola fría en cocina).
 * Muestra pedidos en preparación (>10 min para estar listos): visibles pero no aceptables,
 * con barra de acento gris para enfatizar que aún están en cocina.
 */
export function UpcomingOrdersSection({ items, now }: { items: BoardOrder[]; now: number }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <section className="mt-4 overflow-hidden rounded-[20px] border border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
      >
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: 'rgba(16, 185, 129, 0.14)',
            color: '#065F46',
          }}
        >
          <Icon name="schedule" size={18} filled />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
            Próximos pedidos
          </div>
          <div className="text-sm font-bold text-ink">
            {items.length} {items.length === 1 ? 'en cocina' : 'en cocina'}
          </div>
        </div>
        <span
          className="inline-flex text-ink-muted transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <Icon name="expand_more" size={22} />
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-border/40 border-t border-border/50 bg-surface/50">
          {items.map((order) => {
            const accent = `#${order.business?.accent_color ?? 'f97316'}`
            const reference =
              order.delivery_reference?.trim() || order.delivery_address?.trim() || ''

            return (
              <li key={order.id} className="flex items-start gap-3 px-4 py-3">
                {/* Accent gris neutro para enfatizar no accionable aún */}
                <span
                  aria-hidden="true"
                  className="mt-1 h-10 w-1 shrink-0 rounded-full bg-zinc-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      {order.business?.name ?? 'Restaurante'}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-ink">
                    {order.customer_name ?? 'Cliente'}
                  </div>
                  {reference && (
                    <div className="mt-0.5 truncate text-[12px] text-ink-muted">{reference}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    {minutesFromNow(order.estimated_ready_at, now)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">#{order.short_id}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
