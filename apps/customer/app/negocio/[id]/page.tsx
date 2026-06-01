'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { type ProductItem, ProductModal } from '@/components/product-modal'
import { Icon, ProductImage } from '@/components/ui'
import { api } from '@/lib/api'
import { useCart } from '@/lib/cart'

interface MenuItem extends ProductItem {
  category_id: string
  is_available: boolean
  is_compact: boolean
  badges: string[]
}
interface Category {
  id: string
  name: string
  blurb: string | null
  items: MenuItem[]
}
interface BusinessDetail {
  business: {
    id: string
    name: string
    tagline: string | null
    accent_color: string
    banner_url: string | null
    estimated_eta_min: number
    estimated_eta_max: number
  }
  categories: Category[]
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`

export default function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<BusinessDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string>('')
  const [modalItem, setModalItem] = useState<MenuItem | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const cart = useCart()

  useEffect(() => {
    let on = true
    api
      .get<ApiEnvelope<BusinessDetail>>(`/public/businesses/${id}`)
      .then((res) => {
        if (!on) return
        setData(res.data)
        setActive(res.data.categories[0]?.id ?? '')
      })
      .catch(
        (e) =>
          on &&
          setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar'),
      )
    return () => {
      on = false
    }
  }, [id])

  function jumpTo(sid: string) {
    setActive(sid)
    const el = sectionRefs.current[sid]
    if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' })
  }

  if (error) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center">
        <p className="t-muted">{error}</p>
        <Link href="/" className="mt-3 inline-block text-brand text-sm underline">
          Volver al inicio
        </Link>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-10">
        <div className="h-[280px] animate-pulse rounded-2xl bg-white" />
      </main>
    )
  }

  const { business, categories } = data
  const count = cart.count()
  const subtotal = cart.subtotal()

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-32">
      {/* Hero */}
      <div
        className="relative h-[280px] overflow-hidden text-white"
        style={{
          backgroundColor: '#1A1614',
          backgroundImage: business.banner_url
            ? `url("${business.banner_url}")`
            : `linear-gradient(135deg, #${business.accent_color} 0%, #1A1614 130%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.75) 100%)',
          }}
        />
        <div className="relative flex items-center justify-between px-4 pt-12">
          <Link
            href="/"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur"
            aria-label="Volver"
          >
            <Icon.Back />
          </Link>
        </div>
        <div className="absolute right-0 bottom-0 left-0 px-5 pb-5">
          <div
            className="t-display text-[38px] leading-[1.05]"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            {business.name}
          </div>
          {business.tagline && (
            <div
              className="mt-1.5 text-[13px] opacity-90"
              style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}
            >
              {business.tagline}
            </div>
          )}
          <div className="mt-3 flex gap-3.5 text-[13px]">
            <span
              className="inline-flex items-center gap-1.5"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
            >
              <Icon.Clock /> {business.estimated_eta_min}–{business.estimated_eta_max} min
            </span>
            <span className="w-px bg-white/30" />
            <span
              className="inline-flex items-center gap-1.5"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
            >
              <Icon.Truck /> Delivery
            </span>
          </div>
        </div>
      </div>

      {/* Sticky tabs */}
      <div className="t-section-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`t-chip${active === c.id ? ' active' : ''}`}
            onClick={() => jumpTo(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Sections */}
      <div className="px-4 pt-2">
        {categories.map((sec) => (
          <div
            key={sec.id}
            ref={(el) => {
              sectionRefs.current[sec.id] = el
            }}
            className="pt-4"
            style={{ scrollMarginTop: 70 }}
          >
            <div className="mb-2.5">
              <div className="t-display text-[22px]">{sec.name}</div>
              {sec.blurb && (
                <div className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                  {sec.blurb}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {sec.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.is_available}
                  onClick={() => setModalItem(item)}
                  className="flex items-stretch gap-3.5 rounded-[20px] border border-border bg-white p-3 text-left disabled:opacity-50"
                >
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      {item.badges?.[0] && (
                        <span
                          className="mb-1.5 inline-block rounded-md px-2 py-[3px] font-bold text-[10px] uppercase"
                          style={{
                            letterSpacing: '0.08em',
                            color: '#F97316',
                            background: 'rgba(249,115,22,0.08)',
                          }}
                        >
                          {item.badges[0]}
                        </span>
                      )}
                      <div className="t-display mb-1 text-[16px]">{item.name}</div>
                      {item.description && (
                        <div
                          className="text-[12px] leading-[1.4]"
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
                    </div>
                    <div className="mt-2 font-semibold text-[15px] tabular-nums">
                      {soles(item.base_price)}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <ProductImage
                      label={item.name}
                      hue={item.image_hue ?? 14}
                      size={92}
                      compact={item.is_compact}
                    />
                    <span
                      className="absolute flex h-8 w-8 items-center justify-center rounded-full text-white"
                      style={{
                        right: -6,
                        bottom: -6,
                        background: '#F97316',
                        boxShadow: '0 4px 12px -2px rgba(249,115,22,0.55)',
                      }}
                    >
                      <Icon.Plus />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart sticky bar */}
      {count > 0 && (
        <Link
          href="/checkout"
          className="fixed right-4 bottom-7 left-4 z-30 mx-auto flex max-w-[736px] items-center justify-between rounded-[18px] px-[18px] py-3.5 font-semibold text-[16px] text-white"
          style={{
            background: '#F97316',
            boxShadow: '0 12px 28px -10px rgba(249,115,22,0.6), 0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.22] font-bold text-[13px]">
              {count}
            </span>
            Ver mi pedido
          </span>
          <span className="tabular-nums">{soles(subtotal)}</span>
        </Link>
      )}

      {modalItem && (
        <ProductModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onAdd={(line) => {
            cart.addLine(business.id, business.name, line)
            setModalItem(null)
          }}
        />
      )}
    </main>
  )
}
