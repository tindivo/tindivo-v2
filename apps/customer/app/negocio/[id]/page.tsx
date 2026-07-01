'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import Link from 'next/link'
import { use, useEffect, useRef, useState } from 'react'
import { CartButton, CartSheet, CartSidebar } from '@/components/cart-sheet'
import { type ProductItem, ProductModal } from '@/components/product-modal'
import { BottomSheet, Icon, ProductImage } from '@/components/ui'
import { api } from '@/lib/api'
import { type CartLine, useCart } from '@/lib/cart'

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

/** Toast "Añadido al carrito" — entra con slide-down + fade y se auto-oculta. */
function AddedToast({ name }: { name: string }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4"
      style={{
        transform: shown ? 'translateY(0)' : 'translateY(-14px)',
        opacity: shown ? 1 : 0,
        transition: 'transform 240ms cubic-bezier(0.16,1,0.3,1), opacity 240ms ease',
      }}
    >
      <div className="flex max-w-[92%] items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.28)]">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(26,150,80,0.12)', color: '#1A8050' }}
        >
          <Icon.Check />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[14px] leading-tight">Añadido al carrito</div>
          <div className="truncate text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
            {name}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<BusinessDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string>('')
  const [modalItem, setModalItem] = useState<MenuItem | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const cart = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [pending, setPending] = useState<Omit<CartLine, 'key'> | null>(null)
  const [addedToast, setAddedToast] = useState<{ name: string; id: number } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function notifyAdded(name: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setAddedToast({ name, id: Date.now() })
    toastTimer.current = setTimeout(() => setAddedToast(null), 2200)
  }
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

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
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center md:max-w-[860px]">
        <p className="t-muted">{error}</p>
        <Link href="/" className="mt-3 inline-block text-brand text-sm underline">
          Volver al inicio
        </Link>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-10 md:max-w-[860px]">
        <div className="h-[280px] animate-pulse rounded-2xl bg-white" />
      </main>
    )
  }

  const { business, categories } = data
  const count = cart.count()
  const subtotal = cart.subtotal()

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-32 md:max-w-[860px] lg:grid lg:max-w-7xl lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:px-6 lg:pt-6">
      <div className="lg:min-w-0">
        {/* Hero */}
        <div
          className="relative h-[280px] overflow-hidden text-white lg:h-[320px] lg:rounded-[32px]"
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
            <CartButton tone="dark" />
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
              <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
                {sec.items.map((item) => {
                  const groups = item.modifier_groups ?? []
                  const hasOptions = groups.some((g) => g.options.length > 0)
                  const hasPaidOptions = groups.some((g) =>
                    g.options.some((o) => Number(o.additional_price) > 0),
                  )
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.is_available}
                      onClick={() => setModalItem(item)}
                      className="flex items-stretch gap-3.5 rounded-[20px] border border-border bg-white p-3 text-left disabled:opacity-50"
                    >
                      <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <div>
                          {/* is_compact = "featured" (historical column name; toggle "Destacado" en negocios) */}
                          {(item.is_compact || item.badges?.[0]) && (
                            <span className="mb-1.5 flex flex-wrap gap-1.5">
                              {item.is_compact && (
                                <span
                                  className="inline-block rounded-md px-2 py-[3px] font-bold text-[10px] uppercase"
                                  style={{
                                    letterSpacing: '0.08em',
                                    color: '#F97316',
                                    background: 'rgba(249,115,22,0.08)',
                                  }}
                                >
                                  ★ Destacado
                                </span>
                              )}
                              {item.badges?.[0] && (
                                <span
                                  className="inline-block rounded-md px-2 py-[3px] font-bold text-[10px] uppercase"
                                  style={{
                                    letterSpacing: '0.08em',
                                    color: '#F97316',
                                    background: 'rgba(249,115,22,0.08)',
                                  }}
                                >
                                  {item.badges[0]}
                                </span>
                              )}
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
                          {hasPaidOptions
                            ? `Desde ${soles(item.base_price)}`
                            : soles(item.base_price)}
                          {hasOptions && (
                            <span
                              className="ml-1.5 font-normal text-[11px]"
                              style={{ color: 'rgba(26,22,20,0.5)' }}
                            >
                              · Personalizable
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <ProductImage
                          label={item.name}
                          hue={item.image_hue ?? 14}
                          size={92}
                          src={item.image_url}
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
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="hidden lg:sticky lg:top-6 lg:block">
        <CartSidebar businessId={business.id} businessName={business.name} />
      </aside>

      {/* Cart sticky bar → abre la hoja de previsualización (ver la bolsa antes de pagar) */}
      {count > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed right-4 bottom-7 left-4 z-30 mx-auto flex max-w-[736px] items-center justify-between rounded-[18px] px-[18px] py-3.5 font-semibold text-[16px] text-white lg:hidden"
          style={{
            background: '#F97316',
            boxShadow: '0 12px 28px -10px rgba(249,115,22,0.6), 0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.22] font-bold text-[13px]">
              {count}
            </span>
            Ver mi bolsa
          </span>
          <span className="tabular-nums">{soles(subtotal)}</span>
        </button>
      )}

      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} />}

      {modalItem && (
        <ProductModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onAdd={(line) => {
            // Bolsa mono-negocio: si ya hay ítems de otro restaurante, pedir confirmación
            // antes de vaciar y empezar de nuevo (en vez de borrar en silencio).
            if (cart.businessId && cart.businessId !== business.id && cart.lines.length > 0) {
              setModalItem(null)
              setPending(line)
              return
            }
            cart.addLine(business.id, business.name, line)
            notifyAdded(line.name)
            setModalItem(null)
          }}
        />
      )}

      {pending && (
        <BottomSheet open onClose={() => setPending(null)}>
          <div className="px-5 pt-6 pb-7">
            <div className="t-display text-[20px] leading-[1.15]">¿Empezar una bolsa nueva?</div>
            <p className="mt-2 text-[14px]" style={{ color: 'rgba(26,22,20,0.65)' }}>
              Tu bolsa tiene productos de <span className="font-semibold">{cart.businessName}</span>
              . Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para
              empezar en <span className="font-semibold">{business.name}</span>.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-[14px] py-3.5 font-semibold text-[15px]"
                style={{ background: 'rgba(26,22,20,0.06)' }}
              >
                Mantener
              </button>
              <button
                type="button"
                onClick={() => {
                  cart.addLine(business.id, business.name, pending)
                  notifyAdded(pending.name)
                  setPending(null)
                }}
                className="t-btn t-btn-primary flex-1"
              >
                Vaciar y empezar
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {addedToast && <AddedToast key={addedToast.id} name={addedToast.name} />}
    </main>
  )
}
