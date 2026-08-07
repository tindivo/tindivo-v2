'use client'

import { type OrderStatus, type TrackingStep, toTrackingStep } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { ActiveOrder } from '@/features/catalog/types'

const TRACKING_LABEL: Record<TrackingStep, string> = {
  received: 'Pedido recibido',
  preparing: 'Preparando',
  ontheway: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

interface ActiveOrderBannerProps {
  orders: ActiveOrder[]
}

function elapsedLabel(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} días`
}

function ActiveOrderCard({ order }: { order: ActiveOrder }) {
  const [elapsed, setElapsed] = useState(() => elapsedLabel(order.createdAt))

  useEffect(() => {
    setElapsed(elapsedLabel(order.createdAt))
    const id = setInterval(() => setElapsed(elapsedLabel(order.createdAt)), 60000)
    return () => clearInterval(id)
  }, [order.createdAt])

  // `awaiting_payment` se colapsa en "Pedido recibido" para el tracking, pero
  // aquí el cliente TIENE que hacer algo: pagar antes de que el pedido expire.
  const mustPay = order.status === 'awaiting_payment'
  const step = toTrackingStep(order.status as OrderStatus)
  const label = mustPay ? 'Falta tu pago' : TRACKING_LABEL[step]

  return (
    <Link
      href={`/pedido/${order.shortId}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-[18px] border border-white/40 bg-ink px-4 py-3.5 text-white shadow-elev-3"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-brand/20 blur-3xl transition-opacity group-hover:opacity-80" />
      <div className="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-brand/10 blur-2xl" />

      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/25">
        {mustPay ? (
          <Icon name="payments" size={20} className="relative text-brand-light" />
        ) : (
          <>
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-brand-light" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-brand" />
          </>
        )}
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
            {mustPay ? 'Pago pendiente' : 'Pedido en curso'}
          </span>
          <span className="text-[10px] text-white/50">· {elapsed}</span>
        </span>
        <span className="block font-semibold text-[15px]">{label}</span>
      </span>

      {mustPay ? (
        <span className="relative inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand px-3 py-1.5 text-[12px] font-semibold text-white transition-colors group-hover:bg-brand-dark">
          Pagar <Icon name="chevron_right" size={16} />
        </span>
      ) : (
        <span className="relative inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/90 backdrop-blur-sm transition-colors group-hover:bg-white/15">
          Ver <Icon name="chevron_right" size={16} />
        </span>
      )}
    </Link>
  )
}

export function ActiveOrderBanner({ orders }: ActiveOrderBannerProps) {
  const count = orders.length
  // Si hay uno esperando pago, ese manda aunque no sea el más reciente: es el
  // único que el cliente puede desbloquear desde aquí, y expira solo.
  const featured = useMemo(
    () => orders.find((o) => o.status === 'awaiting_payment') ?? orders[0],
    [orders],
  )

  if (count === 0 || !featured) return null

  if (count === 1 || featured.status === 'awaiting_payment') {
    return (
      <div className="px-4 pb-4">
        <ActiveOrderCard order={featured} />
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <Link
        href="/pedidos"
        className="group relative flex items-center gap-3 overflow-hidden rounded-[18px] border border-white/40 bg-ink px-4 py-3.5 text-white shadow-elev-3"
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-brand/10 blur-2xl" />

        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/25">
          <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-brand-light" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-brand" />
        </span>

        <span className="relative min-w-0 flex-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-light">
            Pedidos en curso
          </span>
          <span className="block font-semibold text-[15px]">Tienes {count} pedidos activos</span>
        </span>

        <span className="relative inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white/90 backdrop-blur-sm transition-colors group-hover:bg-white/15">
          Ver <Icon name="chevron_right" size={16} />
        </span>
      </Link>
    </div>
  )
}
