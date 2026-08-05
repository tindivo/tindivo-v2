import { Skeleton } from '@tindivo/ui'
import type { PublicBusiness } from '@/features/catalog/types'
import { BusinessCard } from './business-card'

interface BusinessGridProps {
  businesses: PublicBusiness[] | null
  error: string | null
}

export function BusinessGrid({ businesses, error }: BusinessGridProps) {
  return (
    <>
      <div className="px-4 pt-4 pb-2">
        <div className="font-display text-[22px] font-bold tracking-tight">Restaurantes</div>
      </div>

      {error && <p className="px-4 text-danger text-sm">{error}</p>}

      <div className="flex flex-col gap-3 px-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
        {businesses === null && !error
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[112px] rounded-[20px]" />)
          : businesses?.map((b) => <BusinessCard key={b.id} business={b} />)}
        {businesses && businesses.length === 0 && (
          <p className="py-8 text-center text-[14px] text-ink-muted md:col-span-2 lg:col-span-3">
            Aún no hay restaurantes abiertos esta noche.
          </p>
        )}
      </div>
    </>
  )
}
