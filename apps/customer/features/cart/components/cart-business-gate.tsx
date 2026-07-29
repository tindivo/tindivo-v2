'use client'

import { Icon } from '@tindivo/ui'
import type { CartLayout } from '@/features/cart/types'
import type { BusinessOrderingInfo } from '@/lib/business-ordering'
import { useCart } from '@/lib/cart'
import { buildCartWhatsAppMessage, telLink, waOrderLink } from '@/lib/whatsapp'

interface CartBusinessGateProps {
  info: BusinessOrderingInfo
  layout: CartLayout
}

export function CartBusinessGate({ info, layout }: CartBusinessGateProps) {
  const cart = useCart()

  if (info.mode !== 'whatsapp') return null

  if (!info.whatsappNumber) {
    return (
      <p className={`text-[13px] text-ink/55 ${layout === 'block' ? 'mt-3' : 'flex-1'}`}>
        Este negocio aún no configuró su WhatsApp para pedidos.
      </p>
    )
  }

  const href = waOrderLink(
    info.whatsappNumber,
    buildCartWhatsAppMessage(cart.businessName ?? 'negocio', cart.lines, cart.subtotal()),
  )

  return (
    <div
      className={layout === 'block' ? 'mt-3 flex flex-col gap-2' : 'flex flex-1 items-center gap-2'}
    >
      <a
        className={`t-btn t-btn-primary ${layout === 'block' ? 't-btn-block' : 'flex-1'}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        Pedir por WhatsApp
      </a>
      <a
        className={`t-btn t-btn-secondary ${layout === 'block' ? 't-btn-block' : ''}`}
        href={telLink(info.whatsappNumber)}
        aria-label="Llamar al negocio"
      >
        <Icon name="phone" size={20} />
        {layout === 'block' && <span>Llamar</span>}
      </a>
    </div>
  )
}
