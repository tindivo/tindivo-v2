import Link from 'next/link'
import { Icon } from '@/components/ui'
import type { OrderRow } from '@/features/account/types'

interface OrdersListProps {
  orders: OrderRow[]
}

export function OrdersList({ orders }: OrdersListProps) {
  return (
    <Link
      href="/pedidos"
      className="mt-6 flex items-center gap-3 rounded-[18px] border border-border bg-white px-4 py-3.5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(249,115,22,0.1)] text-[#F97316]">
        <Icon name="schedule" size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[14px]">Historial de pedidos</div>
        <div className="text-[11px] text-ink/55">
          {orders.length > 0
            ? `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`
            : 'Tus pedidos anteriores'}
        </div>
      </div>
      <span className="opacity-40">›</span>
    </Link>
  )
}
