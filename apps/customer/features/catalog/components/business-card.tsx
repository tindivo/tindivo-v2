import { Card, Icon } from '@tindivo/ui'
import Image from 'next/image'
import type { PublicBusiness } from '@/features/catalog/types'

interface BusinessCardProps {
  business: PublicBusiness
}

export function BusinessCard({ business }: BusinessCardProps) {
  const b = business
  return (
    <Card
      as="a"
      href={`/negocio/${b.id}`}
      className="flex items-center gap-3 p-3 transition-all hover:-translate-y-0.5 hover:shadow-elev-2 active:translate-y-0 active:scale-[0.985]"
    >
      {b.logo_url ? (
        <Image
          src={b.logo_url}
          alt={b.name}
          width={72}
          height={72}
          sizes="72px"
          loading="lazy"
          decoding="async"
          className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-surface-low">
          <Icon name="store" size={24} className="text-ink-subtle" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-0.5">
        <div>
          <div className="font-display text-[17px] font-bold leading-tight tracking-tight">
            {b.name}
          </div>
          {b.tagline && <div className="mt-0.5 text-[13px] text-ink-muted">{b.tagline}</div>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          {b.primary_capability === 'catalog_only' ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="chat" size={16} /> Pedidos por WhatsApp
            </span>
          ) : (
            <>
              {b.is_open_now === false && (
                <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-[1px] font-semibold text-danger">
                  Cerrado
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Icon name="schedule" size={16} /> {b.estimated_eta_min}–{b.estimated_eta_max} min
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="local_shipping" size={16} /> Delivery
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
