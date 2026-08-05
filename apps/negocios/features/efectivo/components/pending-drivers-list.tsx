'use client'

import { Button, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import type { PendingByDriver } from '../hooks/use-cash-settlements'

export function PendingDriversList({ drivers }: { drivers: PendingByDriver[] }) {
  const total = drivers.reduce((s, d) => s + d.total, 0)

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2.5">
        <Icon name="two_wheeler" size={20} className="text-ink-muted" />
        <div className="text-base font-bold">Pendiente del motorizado</div>
        <div className="flex-1" />
        <div className="font-mono text-[15px] font-bold">{soles(total)}</div>
      </div>
      <div className="flex flex-col gap-2.5">
        {drivers.map((d) => (
          <div
            key={d.driverId}
            className="flex items-center gap-3 rounded-2xl border border-ink/[0.04] bg-card p-3 shadow-elev-1"
          >
            <div className="h-full w-1 shrink-0 self-stretch rounded-l-2xl bg-ink-subtle" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{d.name}</div>
              <div className="text-xs text-ink-muted">
                {d.orders} {d.orders === 1 ? 'pedido cobrado' : 'pedidos cobrados'} · aún no
                entregado
              </div>
            </div>
            <div className="font-mono text-base font-bold tabular-nums">{soles(d.total)}</div>
            {d.phone && (
              <Button
                as="a"
                variant="outline"
                size="sm"
                href={`tel:+51${d.phone.replace(/\D/g, '')}`}
              >
                <Icon name="call" size={15} /> Llamar
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
