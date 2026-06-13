'use client'

import { Icon } from '@tindivo/ui'
import { telLink, waLink } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'

/** Card del cliente: llamar + WhatsApp con mensaje precargado (Momento 3). */
export function CustomerCard({ order }: { order: OrderDetailResponse['order'] }) {
  return (
    <div className="mt-3.5 rounded-[22px] border border-ink/5 bg-white p-[18px]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(26,22,20,0.06)' }}
        >
          <Icon.Person />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px]">{order.customerName ?? 'Cliente'}</p>
          {order.customerPhone && (
            <p className="mt-0.5 font-mono text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              {order.customerPhone}
            </p>
          )}
        </div>
      </div>
      {order.customerPhone && (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <a
            href={telLink(order.customerPhone)}
            className="t-btn t-btn-ghost"
            style={{ padding: '12px 16px', fontSize: 14 }}
          >
            <span className="mr-1.5 inline-flex align-middle">
              <Icon.Phone />
            </span>
            Llamar
          </a>
          <a
            href={waLink(order.customerPhone, order.shortId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-[18px] font-semibold text-[14px] text-white"
            style={{ background: '#25D366', padding: '12px 16px' }}
          >
            WhatsApp
          </a>
        </div>
      )}
    </div>
  )
}
