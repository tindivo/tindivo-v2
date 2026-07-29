'use client'

import { type OrderStatus, type TrackingStep, toTrackingStep } from '@tindivo/contracts'
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
        className="flex items-center gap-3 rounded-[18px] bg-gradient-to-br from-[#1A1614] to-[#2A211C] px-4 py-3.5 text-white"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(249,115,22,0.25)]">
          <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#FDBA74]" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#FDBA74]">
            Pedido en curso
          </span>
          <span className="block font-semibold text-[15px]">
            {TRACKING_LABEL[toTrackingStep(order.status as OrderStatus)]}
          </span>
        </span>
        <span className="shrink-0 text-[13px] opacity-80">Ver ›</span>
      </Link>
    </div>
  )
}
