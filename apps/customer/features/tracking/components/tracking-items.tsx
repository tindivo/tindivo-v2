'use client'

import { soles } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingItemsProps {
  data: Tracking
}

export function TrackingItems({ data }: TrackingItemsProps) {
  const itemCount = data.items.length

  return (
    <div className="mt-3.5 rounded-[22px] border border-ink/[0.04] bg-card px-[18px] py-4 lg:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Detalle
        </div>
        <div className="text-[12px] text-ink-subtle">
          {data.deliveryMethod === 'delivery' ? 'Delivery' : 'Recojo'} · {itemCount}{' '}
          {itemCount === 1 ? 'producto' : 'productos'}
        </div>
      </div>

      {data.items.map((it, idx) => (
        <div key={`item-${idx}-${it.name}`} className="py-1.5">
          <div className="flex justify-between text-[14px] text-ink-muted">
            <span>
              {it.qty}× {it.name}
            </span>
            <span className="tabular-nums">{soles(it.lineTotal)}</span>
          </div>
          {(it.modifiers ?? []).map((m, mi) => (
            <div
              key={`item-${idx}-mod-${mi}-${m.name}`}
              className="mt-0.5 flex justify-between pl-5 text-[12px] text-ink-subtle"
            >
              <span>{m.name}</span>
              {Number(m.price) > 0 && (
                <span className="tabular-nums">+{soles(Number(m.price))}</span>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="my-2.5 h-px bg-ink/[0.08]" />

      {data.driverName && (
        <div className="flex justify-between py-1 text-[13px] text-ink-muted">
          <span>Motorizado</span>
          <span className="font-medium text-ink">{data.driverName}</span>
        </div>
      )}

      {data.paymentIntent === 'pending_cash' && data.paysWith != null && (
        <div className="flex justify-between py-1 text-[13px] text-ink-muted">
          <span>Efectivo</span>
          <span className="font-medium text-ink tabular-nums">
            Pagas con {soles(Number(data.paysWith))}
            {Number(data.changeToGive ?? 0) > 0
              ? ` · vuelto ${soles(Number(data.changeToGive))}`
              : ' · exacto'}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[16px] font-semibold text-ink">
          {data.paymentIntent === 'prepaid' ? 'Total pagado' : 'Total'}
        </span>
        <span className="font-display text-[18px] font-bold tracking-tight tabular-nums">
          {soles(data.total)}
        </span>
      </div>
    </div>
  )
}
