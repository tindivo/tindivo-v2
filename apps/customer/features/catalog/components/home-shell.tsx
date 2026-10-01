'use client'

import { ActiveOrderBanner } from '@/features/catalog/components/active-order-banner'
import { BusinessGrid } from '@/features/catalog/components/business-grid'
import { HomeCarousel } from '@/features/catalog/components/home-carousel'
import { HomeHeader } from '@/features/catalog/components/home-header'
import {
  RESTAURANTS_ANCHOR,
  RestaurantsServiceCard,
} from '@/features/catalog/components/restaurants-service-card'
import { SearchBar } from '@/features/catalog/components/search-bar'
import { SearchResults } from '@/features/catalog/components/search-results'
import { useHomeData } from '@/features/catalog/hooks/use-home-data'
import { firstName } from '@/features/catalog/lib/format'
import type { CatalogUser, PublicBusiness } from '@/features/catalog/types'
import { CourierActiveBanner, CourierServiceCard } from '@/features/courier/components/courier-home'
import {
  type CourierServiceStatus,
  useCourierStatus,
} from '@/features/courier/hooks/use-courier-status'
import { PilotWall } from '@/features/pilot/components/pilot-wall'
import { ReviewCard } from '@/features/reviews/components/review-card'
import { usePendingReview } from '@/features/reviews/hooks/use-pending-review'
import { useActiveOrdersStore } from '@/lib/active-orders'
import { useCatalogSearch } from '@/lib/use-search'

interface HomeShellProps {
  initialBusinesses: PublicBusiness[] | null
  initialUser?: CatalogUser | null
  /** `?q=`: llega desde el estado vacío del buscador de una carta. */
  initialQuery?: string
  /** Estado de Tindivo Entregas leído en el servidor, para pintar las tarjetas en el primer HTML. */
  initialCourierStatus?: CourierServiceStatus | null
}

export function HomeShell({
  initialBusinesses,
  initialUser,
  initialQuery,
  initialCourierStatus,
}: HomeShellProps) {
  const { items, error, user, activeOrders } = useHomeData({
    initialBusinesses,
    initialUser,
  })
  const search = useCatalogSearch(initialQuery)
  const courier = useCourierStatus(initialCourierStatus)
  const openRestaurants =
    items === null
      ? null
      : items.filter((b) => b.primary_capability !== 'catalog_only' && b.is_open_now).length
  const greetingName = firstName(user.name)
  /**
   * El recordatorio de calificar, para quien no lo hizo al salir del tracking
   * (ver `PostDeliveryExitLink`) ni desde el historial.
   *
   * Se consulta cada vez que se abre el inicio con sesión — es la próxima
   * vez que el cliente mira la app, sea al día siguiente o una semana después,
   * dentro de la ventana de `get_pending_review`. Se apaga con sesión
   * anónima: `usePendingReview` ya devuelve `null` para `anon`, pero sin este
   * gate igual dispararía la consulta de sesión en cada visita del muro del
   * piloto.
   */
  const resena = usePendingReview(user.signedIn)
  /**
   * `activeOrders` empieza en `[]` ANTES de la primera respuesta real —el
   * store distingue "no tiene" de "aún no sé" con este flag, que
   * `useActiveOrders()` no expone—. Sin esto, en una carga con un pedido
   * activo de verdad, el recordatorio de reseña alcanzaría a pintarse un
   * instante (la RPC de `get_pending_review` suele volver antes) y
   * desaparecería en cuanto llegara el pedido activo: un destello que no dice
   * nada bueno del producto.
   */
  const activeOrdersLoaded = useActiveOrdersStore((s) => s.loaded)

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface md:max-w-[880px] lg:max-w-6xl xl:max-w-7xl">
      {/* Muro del piloto. Se autodesmonta en PILOT_LAUNCH_AT; después no renderiza nada. */}
      <PilotWall />

      <HomeHeader user={user} />

      <div className="px-4 pt-4 pb-5">
        <h1 className="font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
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

      <div className="px-4 pb-3 empty:hidden">
        <CourierActiveBanner />
      </div>
      {user.signedIn && activeOrders.length > 0 && <ActiveOrderBanner orders={activeOrders} />}
      {/* Y si no hay nada en curso, el popup de calificar lo último que llegó
          (para quien no contestó al entregar). Nunca junto al banner de
          arriba: un pedido en camino ya tiene la atención del cliente, y esto
          es lo de ayer. */}
      {user.signedIn && activeOrdersLoaded && activeOrders.length === 0 && resena.pendiente && (
        <ReviewCard estado={resena} />
      )}

      {/* Primero QUÉ quieres hacer, después DÓNDE (`Docs/Home/README.md`).
          Con Entregas apagado del todo solo queda un servicio, y una tarjeta
          sola no es una elección: el home vuelve a ser la lista.
          Siempre en dos columnas: cuadros en móvil, y en escritorio Entregas
          algo más ancha, porque es la que hay que explicar. */}
      {!courier.loading && courier.status.enabled && (
        <section
          aria-label="Servicios"
          className="grid grid-cols-2 gap-3 px-4 pb-5 lg:grid-cols-[7fr_5fr] lg:gap-4"
        >
          <CourierServiceCard status={courier.status} />
          <RestaurantsServiceCard openCount={openRestaurants} />
        </section>
      )}

      {!search.active && <HomeCarousel />}

      {/* El buscador vive en la sección de restaurantes, bajo su título: busca
          negocios y platos, no entregas. Queda fuera de `BusinessGrid` para
          seguir a la vista mientras se busca, cuando la lista se oculta.
          `scroll-mt`: la cabecera del home es fija y taparía el título al
          llegar desde la tarjeta de Restaurantes. */}
      <section id={RESTAURANTS_ANCHOR} aria-label="Restaurantes" className="scroll-mt-20">
        <h2 className="px-4 pt-4 pb-3 font-display text-[22px] font-bold tracking-tight">
          Restaurantes
        </h2>
        <SearchBar query={search.query} onChange={search.setQuery} />
        <SearchResults search={search} businesses={items} />
        {!search.active && <BusinessGrid businesses={items} error={error} />}
      </section>

      <div className="px-4 pt-6 pb-24 text-center">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          tindivo
        </div>
        <div className="mt-1 text-[11px] text-ink-subtle">
          Pedidos directos desde San Jacinto. Hecho en Áncash.
        </div>
      </div>
    </main>
  )
}
