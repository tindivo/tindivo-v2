'use client'

import { getOpenStatus } from '@tindivo/contracts'
import Link from 'next/link'
import { CartButton } from '@/components/cart-sheet'
import { Icon } from '@/components/ui'
import type { BusinessDetail } from '@/features/catalog/types'

interface BusinessHeroProps {
  business: BusinessDetail['business']
  schedule: BusinessDetail['schedule']
  now: Date
}

export function BusinessHero({ business, schedule, now }: BusinessHeroProps) {
  const openStatus = getOpenStatus(schedule, now)
  const isCatalogOnly = !business.accepts_web_delivery && !business.accepts_web_pickup

  return (
    <div className="relative h-[280px] overflow-hidden text-white lg:h-[320px] lg:rounded-[32px]">
      {business.banner_url ? (
        <img
          src={business.banner_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #${business.accent_color} 0%, #1A1614 130%)`,
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent via-35% from-55% to-black/75" />

      <div className="relative flex items-center justify-between px-4 pt-12">
        <Link
          href="/"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur"
          aria-label="Volver"
        >
          <Icon name="arrow_back" size={20} />
        </Link>
        <CartButton tone="dark" />
      </div>

      <div className="absolute right-0 bottom-0 left-0 px-5 pb-5">
        <div className="t-display t-text-shadow-md text-[38px] leading-[1.05]">{business.name}</div>
        {business.tagline && (
          <div className="t-text-shadow-sm mt-1.5 text-[13px] opacity-90">{business.tagline}</div>
        )}
        <div className="mt-3 flex gap-3.5 text-[13px]">
          {isCatalogOnly ? (
            <span className="t-text-shadow-lg inline-flex items-center gap-1.5">
              <Icon name="chat" size={20} /> Pedidos por WhatsApp
            </span>
          ) : (
            <>
              <span className="t-text-shadow-lg inline-flex items-center gap-1.5">
                <Icon name="schedule" size={20} /> {business.estimated_eta_min}–{business.estimated_eta_max} min
              </span>
              <span className="w-px bg-white/30" />
              <span className="t-text-shadow-lg inline-flex items-center gap-1.5">
                <Icon name="local_shipping" size={20} /> Delivery
              </span>
              {openStatus.kind !== 'no_schedule' && (
                <>
                  <span className="w-px bg-white/30" />
                  <span className="t-text-shadow-lg inline-flex items-center gap-1.5 font-semibold">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${openStatus.kind === 'open' ? 'bg-[#4ADE80]' : 'bg-[#F87171]'}`}
                    />
                    {openStatus.kind === 'open' ? 'Abierto' : 'Cerrado'}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
