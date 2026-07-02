'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { type OrderStatus, type TrackingStep, toTrackingStep } from '@tindivo/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AddressBar } from '@/components/address-bar'
import { CartButton } from '@/components/cart-sheet'
import { Icon, ProductImage } from '@/components/ui'
import { api } from '@/lib/api'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { type SearchItem, useCatalogSearch } from '@/lib/use-search'

const soles = (n: number) => `S/ ${n.toFixed(2)}`

interface PublicBusiness {
  id: string
  name: string
  tagline: string | null
  accent_color: string
  logo_url: string | null
  primary_capability: string
  estimated_eta_min: number
  estimated_eta_max: number
  /** null = sin horario configurado (siempre abierto, sin badge). */
  is_open_now?: boolean | null
}

// Estados internos no terminales (pedido "en curso").
const ACTIVE_STATUSES: OrderStatus[] = [
  'validando',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
]

// Etiqueta del badge según el paso del cliente (4 estados).
const TRACKING_LABEL: Record<TrackingStep, string> = {
  received: 'Pedido recibido',
  preparing: 'Preparando',
  ontheway: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export default function Home() {
  const [items, setItems] = useState<PublicBusiness[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ signedIn: boolean; name: string; userId: string | null }>({
    signedIn: false,
    name: '',
    userId: null,
  })
  const [activeOrder, setActiveOrder] = useState<{ shortId: string; status: string } | null>(null)
  const search = useCatalogSearch()

  useEffect(() => {
    let active = true
    api
      .get<ApiEnvelope<PublicBusiness[]>>('/public/businesses')
      .then((res) => active && setItems(res.data))
      .catch(
        (e) =>
          active &&
          setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar'),
      )

    const supabase = getSupabaseBrowser()
    const applySession = (
      session: { user: { id: string; user_metadata: unknown; email?: string } } | null,
    ) => {
      if (!active) return
      if (!session) {
        setUser({ signedIn: false, name: '', userId: null })
        return
      }
      const meta = session.user.user_metadata as { full_name?: string } | undefined
      setUser({
        signedIn: true,
        name: meta?.full_name ?? session.user.email ?? '',
        userId: session.user.id,
      })
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    // El onboarding (sheet) puede crear la sesión sin salir del home.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      applySession(session),
    )
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Pedido en curso: query del último pedido no terminal + realtime. La query va FUERA
  // del callback de auth (onAuthStateChange) para evitar el deadlock de supabase-js.
  useEffect(() => {
    const uid = user.userId
    if (!uid) {
      setActiveOrder(null)
      return
    }
    let active = true
    const supabase = getSupabaseBrowser()
    const loadActive = () => {
      // RLS ord_customer_read limita a los pedidos del propio usuario.
      supabase
        .from('orders')
        .select('short_id,status')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (!active) return
          const o = data?.[0]
          setActiveOrder(o ? { shortId: o.short_id, status: o.status } : null)
        })
    }
    loadActive()
    const channel = supabase
      .channel(`home-orders-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_user_id=eq.${uid}` },
        () => loadActive(),
      )
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user.userId])

  const firstName = user.name.split(' ')[0] || 'vecino'

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface md:max-w-[880px] lg:max-w-6xl xl:max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-12 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="t-display shrink-0 text-[28px] leading-none">Tindivo</div>
          <div
            className="min-w-0 flex-1 border-l pl-3"
            style={{ borderColor: 'rgba(26,22,20,0.10)' }}
          >
            <AddressBar />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CartButton />
          {user.signedIn ? (
            <Link
              href="/cuenta"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full font-bold text-[14px]"
              style={{ background: '#F97316', color: '#fff' }}
              aria-label="Mi cuenta"
            >
              {firstName[0]?.toUpperCase() ?? 'U'}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => useOnboarding.getState().openSheet({ next: null })}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full font-bold text-[14px]"
              style={{ background: 'rgba(26,22,20,0.06)', color: '#1A1614' }}
              aria-label="Ingresar"
            >
              <Icon.Person />
            </button>
          )}
        </div>
      </div>

      {/* Greeting */}
      <div className="px-5 pt-1 pb-4">
        <h1
          className="t-display text-[32px] leading-[1.05] lg:text-[40px]"
          style={{ letterSpacing: '-0.03em' }}
        >
          {user.signedIn ? (
            <>
              Buenas noches,
              <br />
              {firstName} <span aria-hidden>🍕</span>
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

      {/* Pedido en curso (badge) */}
      {user.signedIn && activeOrder && (
        <div className="px-4 pb-3">
          <Link
            href={`/pedido/${activeOrder.shortId}`}
            className="flex items-center gap-3 rounded-[18px] px-4 py-3.5 text-white"
            style={{ background: 'linear-gradient(135deg,#1A1614 0%,#2A211C 100%)' }}
          >
            <span
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'rgba(249,115,22,0.25)' }}
            >
              <span
                className="absolute h-2.5 w-2.5 animate-ping rounded-full"
                style={{ background: '#FDBA74' }}
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#F97316' }} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: '#FDBA74' }}
              >
                Pedido en curso
              </span>
              <span className="block font-semibold text-[15px]">
                {TRACKING_LABEL[toTrackingStep(activeOrder.status as OrderStatus)]}
              </span>
            </span>
            <span className="shrink-0 text-[13px] opacity-80">Ver ›</span>
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5">
          <span style={{ color: 'rgba(26,22,20,0.4)' }}>
            <Icon.Search />
          </span>
          <input
            type="text"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            style={{ color: '#1A1614' }}
            placeholder="Buscar pizza, hamburguesa, bebida…"
            aria-label="Buscar negocios y platos"
            autoComplete="off"
            enterKeyHint="search"
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter cierra el teclado móvil (la búsqueda ya corre con debounce).
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
          {search.query.length > 0 && (
            <button
              type="button"
              onClick={() => search.setQuery('')}
              aria-label="Limpiar búsqueda"
              className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center"
              style={{ color: 'rgba(26,22,20,0.45)' }}
            >
              <Icon.Close />
            </button>
          )}
        </div>
      </div>

      {/* Resultados de búsqueda (reemplazan hero + lista mientras hay query activa) */}
      {search.active && (
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
                      // La lista completa del home trae is_open_now (badge "Cerrado");
                      // el RPC no lo calcula (fuente de verdad del horario: TS, §19).
                      const full = items?.find((x) => x.id === b.id)
                      return <RestaurantCard key={b.id} b={full ?? { ...b, is_open_now: null }} />
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
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: 'rgba(26,22,20,0.05)', color: 'rgba(26,22,20,0.4)' }}
                  >
                    <Icon.Search />
                  </span>
                  <p className="mt-3 font-semibold text-[15px]">
                    Sin resultados para “{search.query.trim()}”
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                    Prueba con otro nombre de plato o restaurante.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!search.active && (
        <>
          {/* Hero strip */}
          <div className="px-4 pt-2 pb-4">
            <div
              className="relative overflow-hidden rounded-[22px] px-[22px] pt-[22px] pb-6 text-white lg:px-9 lg:pt-9 lg:pb-9"
              style={{
                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 50%, #C2410C 100%)',
                boxShadow: '0 12px 32px -10px rgba(249,115,22,0.45)',
              }}
            >
              <svg
                viewBox="0 0 200 200"
                className="pointer-events-none absolute"
                style={{ right: -40, top: -50, width: 220, height: 220, opacity: 0.18 }}
                aria-hidden
              >
                <title>blob</title>
                <path
                  fill="#FFF7ED"
                  d="M44.7,-67.3C58.1,-58.9,68.9,-44.7,74.6,-29C80.3,-13.3,80.9,3.9,75.6,18.6C70.3,33.4,59.1,45.7,46.1,55.4C33.1,65.1,18.3,72.1,1.7,69.9C-14.8,67.6,-31.3,56.1,-44.6,43.2C-57.9,30.3,-68.1,16.1,-71.8,-0.4C-75.5,-16.9,-72.7,-35.6,-62.4,-46.9C-52.1,-58.1,-34.3,-61.9,-18.5,-67.4C-2.7,-72.8,11.1,-79.9,25,-78.6C38.9,-77.4,52.8,-67.9,65.1,-55.6"
                  transform="translate(100 100)"
                />
              </svg>
              <div className="relative">
                <div
                  className="mb-3 inline-block rounded-full px-2.5 py-1 font-bold text-[10px] uppercase"
                  style={{ letterSpacing: '0.12em', background: 'rgba(255,255,255,0.22)' }}
                >
                  Solo en Tindivo
                </div>
                <div className="t-display text-[22px] leading-[1.15] lg:text-[28px]">
                  Pide en minutos,
                  <br />
                  paga al recibir o por Yape.
                </div>
              </div>
            </div>
          </div>

          {/* Restaurants */}
          <div className="px-5 pt-4 pb-2">
            <div className="t-display text-[22px]">Restaurantes</div>
          </div>

          {error && <p className="px-5 text-danger text-sm">{error}</p>}

          <div className="flex flex-col gap-2.5 px-4 pt-1 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-5">
            {items === null && !error
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="h-[112px] animate-pulse rounded-[20px] bg-white" />
                ))
              : items?.map((b) => <RestaurantCard key={b.id} b={b} />)}
            {items && items.length === 0 && (
              <p className="t-muted py-8 text-center text-[14px] md:col-span-2 lg:col-span-3">
                Aún no hay restaurantes abiertos esta noche.
              </p>
            )}
          </div>
        </>
      )}

      <div className="px-5 pt-6 pb-10 text-center">
        <div className="t-eyebrow" style={{ fontSize: 10, letterSpacing: '0.2em', opacity: 0.7 }}>
          tindivo · piloto
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'rgba(26,22,20,0.4)' }}>
          Pedidos directos desde San Jacinto. Hecho en Áncash.
        </div>
      </div>
    </main>
  )
}

function RestaurantCard({ b }: { b: PublicBusiness }) {
  return (
    <Link
      href={`/negocio/${b.id}`}
      className="flex items-stretch gap-3.5 rounded-[20px] border border-border bg-white p-3"
    >
      {b.logo_url ? (
        <img
          src={b.logo_url}
          alt={b.name}
          className="h-[88px] w-[88px] shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div
          className="t-ph-image flex h-[88px] w-[88px] items-center justify-center"
          style={{ background: `#${b.accent_color}1a` }}
        >
          <span style={{ color: `#${b.accent_color}`, position: 'relative', zIndex: 1 }}>
            <Icon.Store />
          </span>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="t-display text-[18px] leading-tight">{b.name}</div>
          {b.tagline && (
            <div className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              {b.tagline}
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.7)' }}>
          {b.primary_capability === 'catalog_only' ? (
            // Modo catálogo: sin pedidos web — el negocio atiende por WhatsApp.
            <span className="inline-flex items-center gap-1">
              <Icon.Chat /> Pedidos por WhatsApp
            </span>
          ) : (
            <>
              {b.is_open_now === false && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-[1px] font-semibold"
                  style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}
                >
                  Cerrado
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Icon.Clock /> {b.estimated_eta_min}–{b.estimated_eta_max} min
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon.Truck /> Delivery
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

/** Resultado de búsqueda de un plato: navega a la página del negocio. */
function DishResultCard({ item }: { item: SearchItem }) {
  return (
    <Link
      href={`/negocio/${item.business_id}`}
      className="flex items-center gap-3.5 rounded-[20px] border border-border bg-white p-3"
    >
      <ProductImage label={item.name} hue={item.image_hue ?? 14} size={64} src={item.image_url} />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[16px] leading-tight">{item.name}</div>
        {item.description && (
          <div
            className="mt-0.5 text-[12px] leading-[1.4]"
            style={{
              color: 'rgba(26,22,20,0.55)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </div>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-semibold text-[14px] tabular-nums">
            {soles(Number(item.base_price))}
          </span>
          <span className="truncate text-[11px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
            {item.business_name}
          </span>
        </div>
      </div>
    </Link>
  )
}
