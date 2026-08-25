'use client'

import { Button, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import type { CartLayout } from '@/features/cart/types'
import type { BusinessOrderingInfo } from '@/lib/business-ordering'
import { useCart } from '@/lib/cart'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import {
  buildCartWhatsAppMessage,
  type CustomerContext,
  telLink,
  waOrderLink,
} from '@/lib/whatsapp'

interface CartBusinessGateProps {
  info: BusinessOrderingInfo
  layout: CartLayout
}

export function CartBusinessGate({ info, layout }: CartBusinessGateProps) {
  const cart = useCart()
  const [customer, setCustomer] = useState<CustomerContext | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowser()

    async function loadCustomer() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const [{ data: userRow }, { data: addresses }] = await Promise.all([
          supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
          supabase
            .from('customer_addresses')
            .select('line, reference')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .maybeSingle(),
        ])

        if (cancelled) return

        const name =
          userRow?.full_name || (user.user_metadata?.full_name as string | undefined) || null
        const addressLine = addresses?.line ?? null
        const addressReference = addresses?.reference ?? null

        if (name || addressLine || addressReference) {
          setCustomer({ name, addressLine, addressReference })
        }
      } catch {
        // En caso de error de red/auth, se mantiene customer = null (mensaje limpio sin romper la UI)
      }
    }

    loadCustomer()
    return () => {
      cancelled = true
    }
  }, [])

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
    buildCartWhatsAppMessage(cart.businessName ?? 'negocio', cart.lines, cart.subtotal(), customer),
  )

  return (
    <div
      className={layout === 'block' ? 'mt-3 flex flex-col gap-2' : 'flex flex-1 items-center gap-2'}
    >
      <Button
        as="a"
        variant="brand"
        className={layout === 'block' ? 'w-full' : 'flex-1'}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        Pedir por WhatsApp
      </Button>
      <Button
        as="a"
        variant="secondary"
        className={layout === 'block' ? 'w-full' : undefined}
        href={telLink(info.whatsappNumber)}
        aria-label="Llamar al negocio"
      >
        <Icon name="phone" size={20} />
        {layout === 'block' && <span>Llamar</span>}
      </Button>
    </div>
  )
}
