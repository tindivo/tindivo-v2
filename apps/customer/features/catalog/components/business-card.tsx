import { Card, Icon } from '@tindivo/ui'
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
      className="flex items-stretch gap-3.5 transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985]"
    >
      {b.logo_url ? (
        <img
          src={b.logo_url}
          alt={b.name}
          className="h-[88px] w-[88px] shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div
          className="flex h-[88px] w-[88px] items-center justify-center rounded-[16px]"
          style={{ background: `#${b.accent_color}1a` }}
        >
          <span className="relative z-[1]" style={{ color: `#${b.accent_color}` }}>
            <Icon name="store" size={24} />
          </span>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="font-display text-[18px] font-bold leading-tight tracking-tight">
            {b.name}
          </div>
          {b.tagline && <div className="mt-0.5 text-[12px] text-ink-muted">{b.tagline}</div>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
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
