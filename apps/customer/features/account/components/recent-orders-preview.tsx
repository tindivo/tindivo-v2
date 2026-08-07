import { Card, Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { OrderRow } from '@/features/account/types'

interface RecentOrdersPreviewProps {
  orders: OrderRow[]
}

export function RecentOrdersPreview({ orders }: RecentOrdersPreviewProps) {
  if (orders.length === 0) return null

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-display font-bold tracking-tight text-[17px] text-ink">
          Pedidos recientes
        </div>
        <Link
          href="/pedidos"
          className="text-[12px] font-semibold text-brand hover:text-brand-dark"
        >
          Ver historial
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {orders.slice(0, 2).map((o) => (
          <Link key={o.id} href={`/pedido/${o.short_id}`} className="block">
            <Card className="flex items-center gap-3 px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon name="receipt" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] text-ink">Pedido #{o.short_id}</div>
                <div className="text-[12px] text-ink-muted">
                  {statusLabel(o.status)} · {soles(Number(o.order_amount))}
                </div>
              </div>
              <Icon name="chevron_right" size={20} className="text-ink-subtle" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function soles(n: number) {
  return `S/ ${n.toFixed(2)}`
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    validando: 'En revisión',
    pending_acceptance: 'En revisión',
    confirmed: 'Confirmado',
    preparing: 'Preparando',
    waiting_driver: 'Preparando',
    heading_to_restaurant: 'En camino',
    waiting_at_restaurant: 'En camino',
    picked_up: 'En camino',
    delivered: 'Entregado',
    cancelled: 'Cancelado',
  }
  return map[status] ?? status
}
