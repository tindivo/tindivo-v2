'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { ActiveOrder } from '@/features/catalog/types'

interface ActiveOrderBlockBannerProps {
  orders: ActiveOrder[]
  businessName: string
}

export function ActiveOrderBlockBanner({ orders, businessName }: ActiveOrderBlockBannerProps) {
  const count = orders.length
  const order = orders[0]

  return (
    <div className="mx-4 mb-4 overflow-hidden rounded-[18px] border border-brand/20 bg-brand-soft p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Icon name="room_service" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14px] text-ink">
            {count === 1
              ? `Ya tienes un pedido activo en ${businessName}`
              : `Ya tienes ${count} pedidos activos en ${businessName}`}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Te recomendamos esperar a que termine antes de hacer uno nuevo.
          </p>
          {order && (
            <Link
              href={`/pedido/${order.shortId}`}
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
            >
              Ver seguimiento <Icon name="arrow_forward" size={16} />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
