'use client'

import { Icon } from '@/components/ui'
import type { PublicBusiness } from '@/features/catalog/types'
import type { SearchResults as SearchResultsData } from '@/lib/use-search'
import { BusinessCard } from './business-card'
import { DishResultCard } from './dish-result-card'

interface CatalogSearchState {
  query: string
  active: boolean
  loading: boolean
  results: SearchResultsData | null
  error: string | null
}

interface SearchResultsProps {
  search: CatalogSearchState
  businesses: PublicBusiness[] | null
}

export function SearchResults({ search, businesses }: SearchResultsProps) {
  if (!search.active) return null

  return (
    <div aria-live="polite">
      {search.loading && (
        <div className="flex flex-col gap-2.5 px-4 pt-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[112px] animate-pulse rounded-[20px] bg-white" />
          ))}
        </div>
      )}
      {!search.loading && search.error && (
        <p className="px-5 pt-3 text-danger text-sm">{search.error}</p>
      )}
      {!search.loading && search.results && (
        <>
          {search.results.businesses.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-2">
                <div className="t-display text-[22px]">Restaurantes</div>
              </div>
              <div className="flex flex-col gap-2.5 px-4 pt-1 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
                {search.results.businesses.map((b) => {
                  const full = businesses?.find((x) => x.id === b.id)
                  return <BusinessCard key={b.id} business={full ?? { ...b, is_open_now: null }} />
                })}
              </div>
            </>
          )}
          {search.results.items.length > 0 && (
            <>
              <div className="px-5 pt-4 pb-2">
                <div className="t-display text-[22px]">Platos</div>
              </div>
              <div className="flex flex-col gap-2.5 px-4 pt-1 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
                {search.results.items.map((it) => (
                  <DishResultCard key={it.id} item={it} />
                ))}
              </div>
            </>
          )}
          {search.results.businesses.length === 0 && search.results.items.length === 0 && (
            <div className="px-5 py-10 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-black/40">
                <Icon name="search" size={20} />
              </span>
              <p className="mt-3 font-semibold text-[15px]">
                Sin resultados para “{search.query.trim()}”
              </p>
              <p className="mt-1 text-[13px] text-black/55">
                Prueba con otro nombre de plato o restaurante.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
