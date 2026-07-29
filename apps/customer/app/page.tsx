'use client'

import { ActiveOrderBanner } from '@/features/catalog/components/active-order-banner'
import { BusinessGrid } from '@/features/catalog/components/business-grid'
import { CategoryCircles } from '@/features/catalog/components/category-circles'
import { FeaturedProducts } from '@/features/catalog/components/featured-products'
import { HomeHeader } from '@/features/catalog/components/home-header'
import { PromoCarousel } from '@/features/catalog/components/promo-carousel'
import { SearchBar } from '@/features/catalog/components/search-bar'
import { SearchResults } from '@/features/catalog/components/search-results'
import { useHomeData } from '@/features/catalog/hooks/use-home-data'
import { firstName } from '@/features/catalog/lib/format'
import { useCatalogSearch } from '@/lib/use-search'

export default function Home() {
  const { items, error, user, activeOrders } = useHomeData()
  const search = useCatalogSearch()
  const greetingName = firstName(user.name)

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface md:max-w-[880px] lg:max-w-6xl xl:max-w-7xl">
      <HomeHeader user={user} />

      <div className="px-5 pt-1 pb-4">
        <h1 className="t-display text-[32px] leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
          {user.signedIn ? (
            <>
              Buenas noches,
              <br />
              {greetingName} <span aria-hidden>🍕</span>
            </>
          ) : (
            <>
              ¿Qué pedimos
              <br />
              hoy en la noche?
            </>
          )}
        </h1>
      </div>

      {user.signedIn && activeOrders.length > 0 && <ActiveOrderBanner orders={activeOrders} />}

      <SearchBar query={search.query} onChange={search.setQuery} />
      <SearchResults search={search} businesses={items} />

      {!search.active && (
        <>
          <PromoCarousel />
          <CategoryCircles />
          <FeaturedProducts />
          <BusinessGrid businesses={items} error={error} />
        </>
      )}

      <div className="px-5 pt-6 pb-10 text-center">
        <div className="t-eyebrow text-[10px] tracking-[0.2em] opacity-70">tindivo · piloto</div>
        <div className="mt-1 text-[11px] text-ink-subtle">
          Pedidos directos desde San Jacinto. Hecho en Áncash.
        </div>
      </div>
    </main>
  )
}
