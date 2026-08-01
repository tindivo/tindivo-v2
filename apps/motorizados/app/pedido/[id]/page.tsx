'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomActionBar, Button, Icon, ScreenHeader } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { BusinessCard } from '@/components/order/business-card'
import { DeliverSheet } from '@/components/order/deliver-sheet'
import { DeliveredScreen } from '@/components/order/delivered-screen'
import { IncidentSheet } from '@/components/order/incident-sheet'
import { MomentPickedUp } from '@/components/order/moment-picked-up'
import { OrderDetail } from '@/components/order/order-detail'
import { PickupSheet } from '@/components/order/pickup-sheet'
import { PreviewSection } from '@/components/order/preview-section'
import { ReadyPromptSheet } from '@/components/order/ready-prompt-sheet'
import { StatusHero } from '@/components/order/status-hero'
import { WaitTimer } from '@/components/order/wait-timer'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { getOptimistic } from '@/lib/offline-queue'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { postTransition } from '@/lib/transitions'
import type { OrderDetailResponse } from '@/lib/types'

type Mode =
  | 'loading'
  | 'error'
  | 'lost'
  | 'delivered'
  | 'preview'
  | 'heading'
  | 'waiting'
  | 'picked_up'

export default function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const now = useNow()
  const board = useDriverOrders(now)

  const [detail, setDetail] = useState<OrderDetailResponse | null>(null)
  const [gone, setGone] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justDelivered, setJustDelivered] = useState(false)

  const [readyPromptOpen, setReadyPromptOpen] = useState(false)
  const [pickupOpen, setPickupOpen] = useState(false)
  const [deliverOpen, setDeliverOpen] = useState(false)
  const [incidentOpen, setIncidentOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: OrderDetailResponse }>(`/driver/orders/${id}`)
      setDetail(res.data)
      setGone(false)
      setLoadError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Transferido a otro driver, cancelado o inexistente: ya no es nuestro.
        setGone(true)
        return
      }
      setLoadError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo cargar',
      )
    }
  }, [id])

  useEffect(() => {
    void load()
    const supabase = getSupabaseBrowser()
    const channel = supabase
      .channel(`drv-order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => void load(),
      )
      .subscribe()
    // RLS oculta el UPDATE de realtime si el pedido deja de ser visible para
    // este driver (p. ej. transferido): el evento de traspaso y un polling
    // suave cubren ese hueco.
    const onTransfer = () => void load()
    window.addEventListener('tindivo:transfer', onTransfer)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    const poll = window.setInterval(() => void load(), 20_000)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('tindivo:transfer', onTransfer)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(poll)
    }
  }, [id, load])

  // Estado efectivo (cola offline puede ir adelantada al servidor).
  const optimisticStatus = detail ? getOptimistic()[detail.order.id] : undefined
  const status = optimisticStatus ?? detail?.order.status

  const mode: Mode = gone
    ? 'lost'
    : !detail
      ? loadError
        ? 'error'
        : 'loading'
      : status === 'delivered'
        ? 'delivered'
        : status === 'cancelled' || (!detail.isPreview && detail.order.status === 'cancelled')
          ? 'lost'
          : detail.isPreview
            ? 'preview'
            : status === 'heading_to_restaurant'
              ? 'heading'
              : status === 'waiting_at_restaurant'
                ? 'waiting'
                : status === 'picked_up'
                  ? 'picked_up'
                  : 'lost'

  // Pregunta "¿está listo?" una sola vez por pedido al entrar al local.
  useEffect(() => {
    if (mode !== 'waiting') return
    const key = `tindivo.readyprompt.${id}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    setReadyPromptOpen(true)
  }, [mode, id])

  async function run(action: string, params: Record<string, unknown> = {}) {
    setActionError(null)
    setBusy(true)
    try {
      const result = await postTransition(id, action, params)
      if (action === 'deliver') setJustDelivered(true)
      if (result === 'ok') await load()
      else {
        // Encolado offline: reflejar el avance optimista sin red.
        setDetail((d) => (d ? { ...d, order: { ...d.order, status: d.order.status } } : d))
      }
      setPickupOpen(false)
      setDeliverOpen(false)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo completar',
      )
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'loading') {
    return (
      <main className="mx-auto max-w-[480px] px-4 pt-6">
        <div className="h-[180px] animate-pulse rounded-2xl bg-surface-low" />
        <div className="mt-3.5 h-[120px] animate-pulse rounded-2xl bg-surface-low" />
      </main>
    )
  }

  if (mode === 'lost') {
    return (
      <LostScreen
        title="Este pedido ya no está disponible"
        body="Fue cancelado o lo tomó otro motorizado."
      />
    )
  }

  if (mode === 'error' || !detail) {
    return (
      <LostScreen
        title="No pudimos cargar el pedido"
        body={loadError ?? 'Revisa tu conexión e inténtalo de nuevo.'}
      />
    )
  }

  if (mode === 'delivered') {
    if (justDelivered) return <DeliveredScreen detail={detail} justDelivered />
    return (
      <main className="mx-auto min-h-dvh max-w-[480px] bg-surface px-4 pb-6">
        <ScreenHeader title={`Pedido #${detail.order.shortId}`} onBack={() => router.push('/')} />
        <DeliveredScreen detail={detail} justDelivered={false} />
      </main>
    )
  }

  // Gates de la bandeja en preview (HU-D-013 / HU-D-014).
  const isUpcoming =
    detail.order.appearsInQueueAt != null && Date.parse(detail.order.appearsInQueueAt) > now
  const isOverdue =
    detail.order.urgentSince != null ||
    (detail.order.estimatedReadyAt != null && Date.parse(detail.order.estimatedReadyAt) < now)
  const blockedByOverdue = mode === 'preview' && board.hasOverdueAvailable && !isOverdue
  const blockedByCapacity = mode === 'preview' && board.mySlots >= 3

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface pb-28">
      <ScreenHeader title={`Pedido #${detail.order.shortId}`} onBack={() => router.push('/')} />

      <div className="flex-1 px-4 pt-1.5">
        {mode === 'preview' && <PreviewSection detail={detail} now={now} />}

        {mode === 'heading' && (
          <>
            <StatusHero detail={detail} moment={0} />
            <BusinessCard business={detail.business} />
          </>
        )}

        {mode === 'waiting' && (
          <>
            <StatusHero detail={detail} moment={1} />
            {detail.order.waitingAtRestaurantAt && (
              <WaitTimer since={detail.order.waitingAtRestaurantAt} now={now} />
            )}
            <BusinessCard business={detail.business} />
          </>
        )}

        {mode === 'picked_up' && (
          <>
            <StatusHero detail={detail} moment={2} />
            <MomentPickedUp
              detail={detail}
              busy={busy}
              onReport={() => setIncidentOpen(true)}
              onNoShow={() => run('no_show')}
            />
          </>
        )}

        <OrderDetail detail={detail} defaultOpen={mode === 'waiting'} />

        {actionError && <p className="mt-3 px-1 text-[13px] text-danger">{actionError}</p>}
      </div>

      <BottomActionBar>
        {mode === 'preview' &&
          (blockedByCapacity ? (
            <>
              <Button className="w-full" disabled>
                Tomar pedido
              </Button>
              <p className="text-center text-[12px] text-danger">Mochila llena (3/3)</p>
            </>
          ) : blockedByOverdue ? (
            <>
              <Button className="w-full" disabled>
                Tomar pedido
              </Button>
              <p className="text-center text-[12px] text-danger">
                Hay pedidos vencidos con prioridad
              </p>
            </>
          ) : isUpcoming ? (
            <Button className="w-full" disabled>
              Disponible en ~
              {Math.max(
                1,
                Math.round((Date.parse(detail.order.appearsInQueueAt as string) - now) / 60_000),
              )}{' '}
              min
            </Button>
          ) : (
            <Button className="w-full" disabled={busy} onClick={() => run('take')}>
              {busy ? 'Tomando…' : 'Tomar pedido'}
            </Button>
          ))}

        {mode === 'heading' && (
          <Button className="w-full" disabled={busy} onClick={() => run('arrived')}>
            {busy ? 'Un momento…' : 'Llegué al local'}
          </Button>
        )}

        {mode === 'waiting' && (
          <Button className="w-full" disabled={busy} onClick={() => setPickupOpen(true)}>
            Ya recogí el pedido
          </Button>
        )}

        {mode === 'picked_up' && (
          <div className="flex flex-col gap-2 w-full">
            {!detail.order.arrivedAtCustomerAt ? (
              <Button
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setActionError(null)
                  let coords: { lat: number | null; lng: number | null; accuracy_m: number | null } = {
                    lat: null,
                    lng: null,
                    accuracy_m: null,
                  }
                  if (typeof window !== 'undefined' && 'geolocation' in navigator) {
                    try {
                      const posPromise = new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                          enableHighAccuracy: true,
                          timeout: 5000,
                          maximumAge: 0,
                        })
                      })
                      const timeoutPromise = new Promise<null>((resolve) =>
                        setTimeout(() => resolve(null), 5000),
                      )
                      const res = await Promise.race([posPromise, timeoutPromise])
                      if (res && 'coords' in res) {
                        coords = {
                          lat: res.coords.latitude,
                          lng: res.coords.longitude,
                          accuracy_m: res.coords.accuracy,
                        }
                      }
                    } catch {
                      // Ignorar silenciosamente errores de GPS (G1)
                    }
                  }
                  await run('arrived_customer', coords)
                }}
              >
                {busy ? 'Registrando llegada…' : '¡He llegado al domicilio!'}
              </Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={() => setDeliverOpen(true)}>
                Pedido entregado
              </Button>
            )}
          </div>
        )}
      </BottomActionBar>

      {readyPromptOpen && mode === 'waiting' && (
        <ReadyPromptSheet
          onReady={() => {
            setReadyPromptOpen(false)
            setPickupOpen(true)
          }}
          onWaiting={() => setReadyPromptOpen(false)}
        />
      )}

      {pickupOpen && (
        <PickupSheet
          detail={detail}
          now={now}
          busy={busy}
          onConfirm={({ band, slots }) => run('pickup', { band, slots })}
          onClose={() => setPickupOpen(false)}
        />
      )}

      {deliverOpen && (
        <DeliverSheet
          detail={detail}
          busy={busy}
          onConfirm={(paymentReal) => run('deliver', { paymentReal })}
          onNoShow={() => run('no_show')}
          onClose={() => setDeliverOpen(false)}
        />
      )}

      {incidentOpen && <IncidentSheet orderId={id} onClose={() => setIncidentOpen(false)} />}
    </main>
  )
}

function LostScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/[0.08] text-ink-subtle">
        <Icon name="close" size={30} />
      </span>
      <h1 className="t-display mt-5 text-[24px]">{title}</h1>
      <p className="t-muted mt-2 text-[14px]">{body}</p>
      <Link href="/" className="t-btn t-btn-primary t-btn-block mt-6">
        Volver al inicio
      </Link>
    </main>
  )
}
