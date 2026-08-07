import { Card, Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { OrderRow } from '@/features/account/types'

interface OrdersListProps {
  orders: OrderRow[]
}

export function OrdersList({ orders }: OrdersListProps) {
  return (
    <Link href="/pedidos" className="mt-6 block">
      <Card className="flex items-center gap-3 px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon name="schedule" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] text-ink">Historial de pedidos</div>
          <div className="text-[11px] text-ink-muted">
            {orders.length > 0
              ? `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`
              : 'Tus pedidos anteriores'}
          </div>
        </div>
        <Icon name="chevron_right" size={20} className="text-ink-subtle" />
      </Card>
    </Link>
  )
}
