import { Skeleton } from '@/components/ui'
import type { PublicBusiness } from '@/features/catalog/types'
import { BusinessCard } from './business-card'

interface BusinessGridProps {
  businesses: PublicBusiness[] | null
  error: string | null
}

export function BusinessGrid({ businesses, error }: BusinessGridProps) {
  return (
    <>
      <div className="px-5 pt-5 pb-2">
        <div className="t-display text-[22px]">Restaurantes</div>
      </div>

      {error && <p className="px-5 text-danger text-sm">{error}</p>}

      <div className="flex flex-col gap-3 px-4 pt-1 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
        {businesses === null && !error
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[112px] rounded-[20px]" />)
          : businesses?.map((b) => <BusinessCard key={b.id} business={b} />)}
        {businesses && businesses.length === 0 && (
          <p className="t-muted py-8 text-center text-[14px] md:col-span-2 lg:col-span-3">
            Aún no hay restaurantes abiertos esta noche.
          </p>
        )}
      </div>
    </>
  )
}
