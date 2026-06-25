'use client'

import { ApiError } from '@tindivo/api-client'
import { type OrderStatus, type TrackingStep, toTrackingStep } from '@tindivo/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { Icon, ScreenHeader, SupportLink } from '@/components/ui'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null | undefined) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)

const STEPS: { key: TrackingStep; label: string; sub: string }[] = [
  { key: 'received', label: 'Pedido recibido', sub: 'El restaurante te llamará para confirmar' },
  { key: 'preparing', label: 'Preparando', sub: 'Tu pedido está en cocina' },
  { key: 'ontheway', label: 'En camino', sub: 'Repartidor en ruta' },
  { key: 'delivered', label: 'Entregado', sub: '¡Buen provecho!' },
]

interface TrackingItemModifier {
  group: string
  name: string
  price: number
}
interface TrackingItem {
  name: string
  qty: number
  lineTotal: number
  /** Snapshots de adicionales (get_tracking, migración 0041). */
  modifiers?: TrackingItemModifier[]
}
interface Tracking {
  shortId: string
  orderNumber: number
  businessName: string
  status: string
  deliveryMethod: string
  paymentIntent: string
  cancelReason: string | null
  /** Efectivo: con cuánto paga el cliente y su vuelto (migración 0042). */
  paysWith?: number | null
  changeToGive?: number | null
  estimatedReadyAt: string | null
  driverName: string | null
  amount: number
  deliveryFee: number
  total: number
  items: TrackingItem[]
}

/** Copy de la pantalla de cancelado según el motivo (DECISIONS §estados / prototipo). */
function cancelledCopy(reason: string | null): { eyebrow: string; title: string; body: string } {
  switch (reason) {
    case 'customer_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Cancelaste tu pedido',
        body: 'Tu pedido fue cancelado sin costo porque aún no estaba confirmado por el restaurante. Puedes volver a pedir cuando quieras.',
      }
    case 'prepay_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Se acabó el tiempo para pagar',
        body: 'Tu pedido fue cancelado porque no recibimos tu comprobante a tiempo. Puedes volver a pedir cuando quieras.',
      }
    case 'validation_timeout':
    case 'pending_acceptance_timeout':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'No pudimos confirmar tu pedido',
        body: 'El restaurante no respondió a tiempo, así que cancelamos tu pedido sin costo. Puedes intentarlo de nuevo.',
      }
    case 'business_cancelled':
      return {
        eyebrow: 'Pedido cancelado',
        title: 'El restaurante canceló tu pedido',
        body: 'Lamentablemente el restaurante no pudo tomar tu pedido. No se te cobró nada. Puedes pedir en otro momento.',
      }
    default:
      return {
        eyebrow: 'Pedido cancelado',
        title: 'Tu pedido fue cancelado',
        body: 'Tu pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.',
      }
  }
}

function etaLabel(estimatedReadyAt: string | null): string {
  if (estimatedReadyAt) {
    const mins = Math.round((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000)
    if (mins > 0) return `~${mins} min`
  }
  return '25–35 min'
}

export default function TrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<Tracking | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Propiedad: si hay sesión y el pedido es del usuario, RLS devuelve la fila (id) → habilita cancelar.
  const [ownedId, setOwnedId] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<Tracking>(`/public/orders/${shortId}`)
      setData(res)
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar')
    }
  }, [shortId])

  useEffect(() => {
    let active = true
    load()
    const id = setInterval(() => {
      if (active) load()
    }, 8000)
    // Comprobación de propiedad (una vez): solo el dueño autenticado ve "Cancelar".
    getSupabaseBrowser()
      .from('orders')
      .select('id')
      .eq('short_id', shortId)
      .maybeSingle()
      .then(({ data: own }) => {
        if (active && own) setOwnedId(own.id)
      })
    return () => {
      active = false
      clearInterval(id)
    }
  }, [shortId, load])

  // Realtime: el dueño autenticado recibe los cambios al instante (el polling de 8s
  // queda como fallback para enlaces compartidos / pérdida de conexión).
  useEffect(() => {
    if (!ownedId) return
    const supabase = getSupabaseBrowser()
    const channel = supabase
      .channel(`order-${ownedId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${ownedId}` },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [ownedId, load])

  async function doCancel() {
    if (!ownedId) return
    setCancelling(true)
    try {
      await api.post(`/customer/orders/${ownedId}/cancel`, {})
      setConfirmCancel(false)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cancelar')
      setConfirmCancel(false)
    } finally {
      setCancelling(false)
    }
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center">
        <p className="text-ink-muted">{error}</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-brand">
          Volver al inicio
        </Link>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-12">
        <div className="h-48 animate-pulse rounded-[22px] bg-white" />
      </main>
    )
  }

  // ── Pantalla de cancelado (terminal) ──────────────────────────────────
  if (data.status === 'cancelled') {
    const c = cancelledCopy(data.cancelReason)
    return (
      <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col bg-surface px-6">
        <div className="flex flex-1 flex-col items-center justify-center pt-10 text-center">
          <div
            className="mb-1 flex h-24 w-24 items-center justify-center rounded-full bg-white text-[#DC2626]"
            style={{ border: '3px solid #DC2626' }}
          >
            {data.cancelReason === 'customer_cancelled' ||
            data.cancelReason === 'business_cancelled' ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M8 8l8 8M16 8l-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <Icon.Clock style={{ width: 44, height: 44 }} />
            )}
          </div>
          <p className="mt-[18px] font-mono text-[10px] text-[#DC2626] uppercase tracking-[0.2em]">
            {c.eyebrow}
          </p>
          <h1 className="t-display mt-1.5 text-[26px] leading-tight">{c.title}</h1>
          <p className="mt-3.5 max-w-[320px] text-[14px] text-ink-muted leading-relaxed">
            {c.body}
          </p>
        </div>
        <div className="pt-5 pb-5">
          <Link href="/" className="t-btn t-btn-primary t-btn-block">
            Volver al menú
          </Link>
          <div className="mt-2.5 flex justify-center">
            <SupportLink orderShortId={data.shortId} />
          </div>
        </div>
      </main>
    )
  }

  const current = toTrackingStep(data.status as OrderStatus)
  const foundIdx = STEPS.findIndex((s) => s.key === current)
  const currentIdx = foundIdx < 0 ? 0 : foundIdx
  // `current` siempre cae en STEPS (el caso `cancelled` ya se manejó); fallback por seguridad de tipos.
  const step = STEPS.find((s) => s.key === current) ?? {
    key: 'received' as TrackingStep,
    label: 'Pedido recibido',
    sub: 'El restaurante te llamará para confirmar',
  }
  const progress = ((currentIdx + 1) / STEPS.length) * 100
  // La ventana de cancelación del cliente es ANTES de la confirmación del negocio
  // (DECISIONS §5). Se basa en el estado crudo, no en el bucket "recibido" (que ya
  // incluye `confirmed`), para no ofrecer cancelar un pedido ya confirmado.
  const cancellable =
    (data.status === 'validando' || data.status === 'pending_acceptance') && Boolean(ownedId)
  const itemCount = data.items.length

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16">
      <ScreenHeader title="Tu pedido" onBack={() => router.back()} />

      <div className="px-4 pt-1.5">
        {/* Hero del estado */}
        <div
          className="relative overflow-hidden rounded-[22px] px-5 py-[22px] text-white"
          style={{ background: '#1A1614' }}
        >
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 h-[140px] w-[140px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%)',
              transform: 'translate(40px,-40px)',
            }}
          />
          <div className="relative z-[1]">
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: '#FED7AA', background: 'rgba(249,115,22,0.2)' }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: '#FDBA74' }}
              />
              Pedido #{data.shortId}
            </div>
            <div className="t-display mt-3 text-[30px] leading-tight">{step.label}</div>
            <div className="mt-1 text-[14px] opacity-70">{step.sub}</div>
            <div
              className="mt-[18px] h-2 overflow-hidden rounded-full"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg,#F97316,#FB923C)',
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[12px] opacity-60">
              <span>
                Paso {currentIdx + 1} de {STEPS.length}
              </span>
              {current !== 'delivered' && (
                <span className="tabular-nums">ETA {etaLabel(data.estimatedReadyAt)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Línea de tiempo */}
        <div
          className="mt-3.5 rounded-[22px] bg-white px-[18px] py-5"
          style={{ border: '1px solid rgba(26,22,20,0.05)' }}
        >
          {STEPS.map((s, i) => {
            const done = i < currentIdx
            const active = i === currentIdx
            const last = i === STEPS.length - 1
            return (
              <div
                key={s.key}
                className="relative flex gap-3.5"
                style={{ paddingBottom: last ? 0 : 18 }}
              >
                {!last && (
                  <div
                    className="absolute w-0.5"
                    style={{
                      left: 13,
                      top: 26,
                      bottom: -8,
                      background: done ? '#F97316' : 'rgba(26,22,20,0.1)',
                    }}
                  />
                )}
                <div
                  className="z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                  style={{
                    background: done || active ? '#F97316' : 'rgba(26,22,20,0.08)',
                    boxShadow: active ? '0 0 0 5px rgba(249,115,22,0.18)' : 'none',
                  }}
                >
                  {done ? (
                    <Icon.Check />
                  ) : (
                    <span
                      className={active ? 'animate-pulse' : ''}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: active ? '#fff' : 'rgba(26,22,20,0.4)',
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 pt-0.5">
                  <div
                    className="text-[15px]"
                    style={{
                      fontWeight: active ? 600 : 500,
                      color: done || active ? '#1A1614' : 'rgba(26,22,20,0.45)',
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="mt-0.5 text-[12px]"
                    style={{ color: active ? '#F97316' : 'rgba(26,22,20,0.5)' }}
                  >
                    {active ? `${s.sub} · ahora` : done ? 'Completado' : s.sub}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detalle */}
        <div
          className="mt-3.5 rounded-[22px] bg-white px-[18px] py-4"
          style={{ border: '1px solid rgba(26,22,20,0.05)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="t-eyebrow">Detalle</div>
            <div className="text-[12px] text-ink-subtle">
              {data.deliveryMethod === 'delivery' ? 'Delivery' : 'Recojo'} · {itemCount}{' '}
              {itemCount === 1 ? 'producto' : 'productos'}
            </div>
          </div>
          {data.items.map((it, idx) => (
            <div key={`item-${idx}-${it.name}`} className="py-1.5">
              <div className="flex justify-between text-[14px] text-ink-muted">
                <span>
                  {it.qty}× {it.name}
                </span>
                <span className="tabular-nums">{soles(it.lineTotal)}</span>
              </div>
              {(it.modifiers ?? []).map((m, mi) => (
                <div
                  key={`item-${idx}-mod-${mi}-${m.name}`}
                  className="mt-0.5 flex justify-between pl-5 text-[12px]"
                  style={{ color: 'rgba(26,22,20,0.5)' }}
                >
                  <span>{m.name}</span>
                  {Number(m.price) > 0 && (
                    <span className="tabular-nums">+{soles(Number(m.price))}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="my-2.5 h-px" style={{ background: 'rgba(26,22,20,0.08)' }} />
          {data.driverName && (
            <div className="flex justify-between py-1 text-[13px] text-ink-muted">
              <span>Motorizado</span>
              <span className="font-medium text-ink">{data.driverName}</span>
            </div>
          )}
          {data.paymentIntent === 'pending_cash' && data.paysWith != null && (
            <div className="flex justify-between py-1 text-[13px] text-ink-muted">
              <span>Efectivo</span>
              <span className="font-medium text-ink tabular-nums">
                Pagas con {soles(Number(data.paysWith))}
                {Number(data.changeToGive ?? 0) > 0
                  ? ` · vuelto ${soles(Number(data.changeToGive))}`
                  : ' · exacto'}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-[16px] text-ink">
              {data.paymentIntent === 'prepaid' ? 'Total pagado' : 'Total'}
            </span>
            <span className="t-display text-[18px] tabular-nums">{soles(data.total)}</span>
          </div>
        </div>

        {/* Footer: cancelar / soporte */}
        <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
          {cancellable ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 font-semibold text-[14px] text-[#DC2626]"
                style={{
                  background: 'rgba(220,38,38,0.06)',
                  border: '1px solid rgba(220,38,38,0.18)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M8 8l8 8M16 8l-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Cancelar pedido
              </button>
              <p className="mt-2 text-center text-[11px] text-ink-subtle leading-relaxed">
                Puedes cancelar mientras el restaurante aún no confirma.
              </p>
            </>
          ) : (
            <div
              className="flex items-start gap-2.5 rounded-[14px] bg-white px-3.5 py-3"
              style={{ border: '1px solid rgba(26,22,20,0.06)' }}
            >
              <div
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[#1A8050]"
                style={{ background: 'rgba(26,150,80,0.1)' }}
              >
                <Icon.Check style={{ width: 14, height: 14 }} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-[13px] leading-snug">
                  {current === 'delivered'
                    ? '¡Tu pedido fue entregado! Buen provecho.'
                    : 'Tu pedido ya está en preparación y no puede cancelarse.'}
                </div>
                <div className="mt-1.5">
                  <SupportLink orderShortId={data.shortId} />
                </div>
              </div>
            </div>
          )}
          {cancellable && (
            <div className="mt-3 flex justify-center">
              <SupportLink orderShortId={data.shortId} />
            </div>
          )}
        </div>

        <Link href="/" className="mt-6 inline-block text-[14px] text-brand">
          ← Volver al inicio
        </Link>
      </div>

      {/* Confirmación de cancelación */}
      {confirmCancel && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
        <div
          className="t-modal-backdrop"
          role="presentation"
          style={{ alignItems: 'center' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmCancel(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmCancel(false)
          }}
        >
          <div
            className="mx-6 rounded-[22px] bg-surface p-6 text-center"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 360 }}
          >
            <h2 className="t-display text-[20px]">¿Cancelar tu pedido?</h2>
            <p className="mt-2 text-[14px] text-ink-muted leading-relaxed">
              Esta acción no se puede deshacer. Si ya pagaste por Yape, te lo devolveremos.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={doCancel}
                disabled={cancelling}
                className="t-btn t-btn-block font-semibold text-white"
                style={{ background: '#DC2626' }}
              >
                {cancelling ? 'Cancelando…' : 'Sí, cancelar pedido'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="t-btn t-btn-ghost t-btn-block"
              >
                No, mantener pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
