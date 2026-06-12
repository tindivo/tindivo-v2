'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui'
import { api } from '@/lib/api'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface PublicBusiness {
  id: string
  name: string
  tagline: string | null
  accent_color: string
  primary_capability: string
  estimated_eta_min: number
  estimated_eta_max: number
}

export default function Home() {
  const [items, setItems] = useState<PublicBusiness[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ signedIn: boolean; name: string }>({
    signedIn: false,
    name: '',
  })

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
    const applySession = (session: { user: { user_metadata: unknown; email?: string } } | null) => {
      if (!active) return
      if (!session) {
        setUser({ signedIn: false, name: '' })
        return
      }
      const meta = session.user.user_metadata as { full_name?: string } | undefined
      setUser({ signedIn: true, name: meta?.full_name ?? session.user.email ?? '' })
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

  const firstName = user.name.split(' ')[0] || 'vecino'

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, letterSpacing: '0.2em' }}>
            San Jacinto, Áncash
          </div>
          <div className="t-display mt-0.5 text-[28px] leading-none">Tindivo</div>
        </div>
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

      {/* Greeting */}
      <div className="px-5 pt-1 pb-4">
        <h1 className="t-display text-[32px] leading-[1.05]" style={{ letterSpacing: '-0.03em' }}>
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

      {/* Search (placeholder, visual) */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5">
          <span style={{ color: 'rgba(26,22,20,0.4)' }}>
            <Icon.Search />
          </span>
          <span className="text-[15px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
            Buscar pizza, hamburguesa, bebida…
          </span>
        </div>
      </div>

      {/* Hero strip */}
      <div className="px-4 pt-2 pb-4">
        <div
          className="relative overflow-hidden rounded-[22px] px-[22px] pt-[22px] pb-6 text-white"
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
            <div className="t-display text-[22px] leading-[1.15]">
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

      <div className="flex flex-col gap-2.5 px-4 pt-1">
        {items === null && !error
          ? [0, 1, 2].map((i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-[20px] bg-white" />
            ))
          : items?.map((b) => <RestaurantCard key={b.id} b={b} />)}
        {items && items.length === 0 && (
          <p className="t-muted py-8 text-center text-[14px]">
            Aún no hay restaurantes abiertos esta noche.
          </p>
        )}
      </div>

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
      <div
        className="t-ph-image flex h-[88px] w-[88px] items-center justify-center"
        style={{ background: `#${b.accent_color}1a` }}
      >
        <span style={{ color: `#${b.accent_color}`, position: 'relative', zIndex: 1 }}>
          <Icon.Store />
        </span>
      </div>
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
          <span className="inline-flex items-center gap-1">
            <Icon.Clock /> {b.estimated_eta_min}–{b.estimated_eta_max} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Truck /> Delivery
          </span>
        </div>
      </div>
    </Link>
  )
}
