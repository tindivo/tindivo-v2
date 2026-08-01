'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { telLink, waLink } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'

/** Card del cliente: llamar + WhatsApp con mensaje precargado (Momento 3). */
export function CustomerCard({
  order,
  businessName,
}: {
  order: OrderDetailResponse['order']
  businessName?: string
}) {
  return (
    <Card className="mt-3.5 p-[18px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
          <Icon name="person" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px]">{order.customerName ?? 'Cliente'}</p>
          {order.customerPhone && (
            <p className="mt-0.5 font-mono text-[13px] text-ink-muted">{order.customerPhone}</p>
          )}
        </div>
      </div>
      {order.customerPhone && (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            as="a"
            href={telLink(order.customerPhone)}
          >
            <Icon name="phone" size={20} />
            Llamar
          </Button>
          <Button
            size="sm"
            className="w-full bg-[#25D366] text-white hover:bg-[#1ebd5a]"
            as="a"
            href={waLink(order.customerPhone, order.shortId, businessName)}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </Button>
        </div>
      )}
    </Card>
  )
}
