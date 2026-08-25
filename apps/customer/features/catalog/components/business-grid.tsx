import { Icon, Skeleton } from '@tindivo/ui'
import type { PublicBusiness } from '@/features/catalog/types'
import { BusinessCard } from './business-card'

interface BusinessGridProps {
  businesses: PublicBusiness[] | null
  error: string | null
}

export function BusinessGrid({ businesses, error }: BusinessGridProps) {
  const platformBusinesses = businesses?.filter((b) => b.primary_capability !== 'catalog_only')
  const whatsappBusinesses = businesses?.filter((b) => b.primary_capability === 'catalog_only')

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <div className="font-display text-[22px] font-bold tracking-tight">Restaurantes</div>
      </div>

      {error && <p className="px-4 text-danger text-sm">{error}</p>}

      <div className="flex flex-col gap-3 px-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
        {businesses === null && !error
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[112px] rounded-[20px]" />)
          : platformBusinesses?.map((b) => <BusinessCard key={b.id} business={b} />)}
        {platformBusinesses && platformBusinesses.length === 0 && (
          <p className="py-8 text-center text-[14px] text-ink-muted md:col-span-2 lg:col-span-3">
            Aún no hay restaurantes abiertos esta noche.
          </p>
        )}
      </div>

      {whatsappBusinesses && whatsappBusinesses.length > 0 && (
        <div className="mt-8 border-t border-ink/[0.06] pt-6">
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon name="chat" size={16} filled />
              </span>
              <h2 className="font-display text-[20px] font-bold tracking-tight text-ink">
                Próximamente pedidos por la plataforma
              </h2>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              Pide directo por WhatsApp mientras preparamos su integración completa a la plataforma.
            </p>
          </div>

          <div className="flex flex-col gap-3 px-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
            {whatsappBusinesses.map((b) => (
              <BusinessCard key={b.id} business={b} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
