import { getOpenStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Image from 'next/image'
import Link from 'next/link'
import { CartButton } from '@/components/cart-sheet'
import type { BusinessDetail } from '@/features/catalog/types'

interface BusinessHeroProps {
  business: BusinessDetail['business']
  schedule: BusinessDetail['schedule']
  now: Date
  openingConfirmed?: boolean | null
}

export function BusinessHero({ business, schedule, now, openingConfirmed }: BusinessHeroProps) {
  const openStatus = getOpenStatus(schedule, now, openingConfirmed)
  const isCatalogOnly = !business.accepts_web_delivery && !business.accepts_web_pickup

  return (
    <div className="relative h-[280px] overflow-hidden text-white lg:h-[320px] lg:rounded-[32px]">
      {business.banner_url ? (
        <Image
          src={business.banner_url}
          alt=""
          fill
          sizes="100vw"
          priority
          draggable={false}
          className="object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #${business.accent_color} 0%, #1a1614 130%)`,
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent via-35% from-55% to-black/75" />

      <div className="relative flex items-center justify-between px-4 pt-12">
        <Link
          href="/"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 bg-ink/45 text-white backdrop-blur"
          aria-label="Volver"
        >
          <Icon name="arrow_back" size={20} />
        </Link>
        <CartButton tone="dark" />
      </div>

      <div className="absolute right-0 bottom-0 left-0 px-5 pb-5">
        <div className="font-display text-[38px] font-bold leading-[1.05] tracking-tight text-shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
          {business.name}
        </div>
        {business.tagline && (
          <div className="mt-1.5 text-[13px] opacity-90 text-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
            {business.tagline}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[13px]">
          {isCatalogOnly ? (
            <span className="inline-flex items-center gap-1.5 text-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              <Icon name="chat" size={18} /> Pedidos por WhatsApp
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                <Icon name="schedule" size={18} /> {business.estimated_eta_min}–
                {business.estimated_eta_max} min
              </span>
              <span className="w-px bg-white/30" />
              <span className="inline-flex items-center gap-1.5 text-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                <Icon name="local_shipping" size={18} /> Delivery
              </span>
              {openStatus.kind !== 'no_schedule' && (
                <>
                  <span className="w-px bg-white/30" />
                  <span className="inline-flex items-center gap-1.5 font-semibold text-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${openStatus.kind === 'open' ? 'bg-success' : 'bg-danger'}`}
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
