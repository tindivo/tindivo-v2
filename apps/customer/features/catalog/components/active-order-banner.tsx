'use client'

import { type OrderStatus, type TrackingStep, toTrackingStep } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { ActiveOrder } from '@/features/catalog/types'

const TRACKING_LABEL: Record<TrackingStep, string> = {
  received: 'Pedido recibido',
  preparing: 'Preparando',
  ontheway: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

interface ActiveOrderBannerProps {
  order: ActiveOrder
}

export function ActiveOrderBanner({ order }: ActiveOrderBannerProps) {
  return (
    <div className="px-4 pb-3">
      <Link
        href={`/pedido/${order.shortId}`}
        className="relative flex items-center gap-3 overflow-hidden rounded-[18px] bg-ink px-4 py-3.5 text-white"
      >
        <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-brand/15 blur-2xl" />
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/25">
          <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-brand-light" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
            Pedido en curso
          </span>
          <span className="block font-semibold text-[15px]">
            {TRACKING_LABEL[toTrackingStep(order.status as OrderStatus)]}
          </span>
        </span>
        <span className="relative inline-flex shrink-0 items-center gap-0.5 text-[13px] text-white/80">
          Ver <Icon name="chevron_right" size={16} />
        </span>
      </Link>
    </div>
  )
}
