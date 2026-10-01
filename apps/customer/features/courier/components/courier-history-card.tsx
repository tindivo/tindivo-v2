'use client'

import type { CourierStatus } from '@tindivo/contracts'
import { Button, Card, CardBody, Icon, StatusPill } from '@tindivo/ui'
import { formatCourierPrice } from '../lib/format'
import { openCourierFlow } from '../lib/open-flow'
import { useCourierStore } from '../lib/store'

/** Lo que `/pedidos` lee de `courier_orders` (RLS `co_customer_select`: solo las suyas). */
export interface CourierHistoryRow {
  id: string
  short_id: string
  status: CourierStatus
  origin_name: string
  destination_name: string
  item_description: string
  fee_amount: number
  created_at: string
  cancel_reason: string | null
}

export const COURIER_HISTORY_COLUMNS =
  'id,short_id,status,origin_name,destination_name,item_description,fee_amount,created_at,cancel_reason'

const LABEL: Record<CourierStatus, string> = {
  requested: 'Buscando motorizado',
  accepted: 'Confirmado',
  heading_to_pickup: 'Confirmado',
  at_pickup: 'Confirmado',
  picked_up: 'En camino',
  heading_to_dropoff: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

function tone(status: CourierStatus) {
  if (status === 'cancelled') return 'danger' as const
  if (status === 'delivered') return 'success' as const
  return 'info' as const
}

/**
 * Una entrega de Tindivo Entregas en el historial, junto a los pedidos de
 * comida. El badge de «Pedidos» ya las contaba; sin esto el cliente veía un
 * «1» y una lista donde su entrega no estaba.
 *
 * Azul, como en el home y en la app del motorizado: de un vistazo se distingue
 * de un pedido a un restaurante.
 */
export function CourierHistoryCard({
  row,
  relativeDate,
}: {
  row: CourierHistoryRow
  relativeDate: string
}) {
  const openTracking = useCourierStore((s) => s.openTracking)
  const active = row.status !== 'delivered' && row.status !== 'cancelled'
  // Sin motorizado y sin cobro: decirlo evita la llamada de «¿me cobraron?».
  const free = row.status === 'cancelled' && row.cancel_reason === 'no_driver'

  return (
    <Card className="overflow-hidden">
      <CardBody className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-[15px] text-ink">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(150deg,#3B82F6,#1D4ED8)]">
              <Icon name="two_wheeler" size={16} filled className="text-white" />
            </span>
            <span className="truncate">Tindivo Entregas</span>
          </span>
          <StatusPill tone={tone(row.status)} dot={active}>
            {LABEL[row.status]}
          </StatusPill>
        </div>

        <div className="flex flex-col gap-0.5 text-[13px] leading-snug text-ink-muted">
          <span className="truncate">
            {row.origin_name} → {row.destination_name}
          </span>
          <span className="line-clamp-1 text-ink-subtle">{row.item_description}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-subtle">
          <span className="font-mono">#{row.short_id}</span>
          <span>·</span>
          <span>{relativeDate}</span>
          <span>·</span>
          <span className="font-semibold tabular-nums text-ink">
            {free ? 'Sin cobro' : formatCourierPrice(Number(row.fee_amount))}
          </span>
        </div>

        {active ? (
          <Button
            variant="brand"
            size="sm"
            className="w-full"
            onClick={() => openTracking(row.short_id)}
          >
            Ver seguimiento
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void openCourierFlow()}
          >
            Pedir otra entrega
          </Button>
        )}
      </CardBody>
    </Card>
  )
}
