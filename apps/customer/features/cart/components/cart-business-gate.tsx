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

function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413Z" />
    </svg>
  )
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

  if (layout === 'block') {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 font-display text-[15px] font-bold text-white shadow-md shadow-[#25D366]/25 transition-all hover:bg-[#20bd5a] active:scale-[0.98]"
        >
          <WhatsAppIcon className="h-5 w-5 shrink-0" />
          <span>Pedir por WhatsApp</span>
        </a>
        <a
          href={telLink(info.whatsappNumber)}
          aria-label="Llamar al negocio"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-surface-low text-[14px] font-semibold text-ink transition-all hover:bg-ink/[0.06] active:scale-[0.98]"
        >
          <Icon name="phone" size={18} />
          <span>Llamar al negocio</span>
        </a>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#25D366] px-3 font-display text-[13px] font-bold text-white shadow-md shadow-[#25D366]/25 transition-all hover:bg-[#20bd5a] active:scale-[0.98] sm:text-[14px]"
      >
        <WhatsAppIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
        <span className="truncate">Pedir por WhatsApp</span>
      </a>
      <a
        href={telLink(info.whatsappNumber)}
        aria-label="Llamar al negocio"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-ink/10 bg-surface-low text-ink transition-all hover:bg-ink/[0.06] active:scale-[0.98]"
      >
        <Icon name="phone" size={20} />
      </a>
    </div>
  )
}
