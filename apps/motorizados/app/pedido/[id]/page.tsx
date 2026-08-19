'use client'

import { ApiError } from '@tindivo/api-client'
import { canalUnico } from '@tindivo/supabase'
import { BottomActionBar, Button, Icon, ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { notifyDriverSuccess } from '@/components/driver-toast'
import { AddressCaptureSheet } from '@/components/order/address-capture-sheet'
import { BusinessCard } from '@/components/order/business-card'
import { ChangeHeadsUp } from '@/components/order/change-heads-up'
import { DeliverSheet } from '@/components/order/deliver-sheet'
import { DeliveredScreen } from '@/components/order/delivered-screen'
import { DestinationCard } from '@/components/order/destination-card'
import { IncidentSheet } from '@/components/order/incident-sheet'
import { MomentPickedUp } from '@/components/order/moment-picked-up'
import { OrderDetail } from '@/components/order/order-detail'
import { PickupSheet } from '@/components/order/pickup-sheet'
import { PreviewSection } from '@/components/order/preview-section'
import { ReadyPromptSheet } from '@/components/order/ready-prompt-sheet'
import { ReleaseSheet } from '@/components/order/release-sheet'
import { StatusHero } from '@/components/order/status-hero'
import { WaitTimer } from '@/components/order/wait-timer'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { isValidPePhone, waLink } from '@/lib/deeplinks'
import { soles } from '@/lib/format'
import { getOptimistic } from '@/lib/offline-queue'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { postTransition } from '@/lib/transitions'
import type { OrderDetailResponse } from '@/lib/types'
import { isOverdue } from '@/lib/urgency'
import { WA_TEMPLATES } from '@/lib/whatsapp-templates'

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

  const [readyPromptOpen, setReadyPromptOpen] = useState(false)
  const [pickupOpen, setPickupOpen] = useState(false)
  const [deliverOpen, setDeliverOpen] = useState(false)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureBusy, setCaptureBusy] = useState(false)
  /** Desde dónde se abrió la captura. Decide si al cerrar se encadena el cobro. */
  const [captureIntent, setCaptureIntent] = useState<'before_deliver' | 'adjust'>('before_deliver')

  /** Toast no bloqueante de sugerencia de WhatsApp post-recogida o al llegar. */
  const [waToast, setWaToast] = useState<{
    templateId: 'on_the_way' | 'outside'
    text: string
    phone: string
  } | null>(null)

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
    // Único por suscripción, no por pedido: volver a abrir el MISMO pedido
    // reusaba el topic mientras el canal anterior seguía dándose de baja, y el
    // `.on()` lanzaba. Ver `canalUnico` en `@tindivo/supabase`.
    const channel = supabase
      .channel(canalUnico(`drv-order-${id}`))
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
      if (action === 'deliver') {
        const shortId = detail?.order.shortId ?? ''
        const paymentReal = (params.paymentReal as string) ?? detail?.order.paymentIntent
        let cashOwed = 0
        if (paymentReal === 'paid_cash') {
          cashOwed = (detail?.order.orderAmount ?? 0) + (detail?.order.deliveryFee ?? 0)
        } else if (paymentReal === 'paid_mixed') {
          cashOwed = Number(params.cashAmount ?? detail?.order.cashAmount ?? 0)
        }

        const msg =
          cashOwed > 0
            ? `Pedido #${shortId} entregado · Cobraste ${soles(cashOwed)} en efectivo`
            : `Pedido #${shortId} entregado con éxito`

        notifyDriverSuccess(msg)
        router.replace('/')
        return
      }

      // Sugerencia no bloqueante de WhatsApp post-recogida (A.5) o al llegar (A.6)
      if (action === 'pickup' || action === 'arrived_customer') {
        const phone = detail?.order.customerPhone
        if (isValidPePhone(phone)) {
          const tmplId = action === 'pickup' ? 'on_the_way' : 'outside'
          const tmpl = WA_TEMPLATES.find((t) => t.id === tmplId)
          if (tmpl) {
            const text = tmpl.build({
              customerName: detail?.order.customerName ?? null,
              businessName: detail?.business?.name ?? null,
            })
            setWaToast({ templateId: tmplId, text, phone })
          }
        }
      }

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

  /**
   * Guarda la ubicación en el directorio (0147).
   *
   * NO BLOQUEA LA ENTREGA, y es la regla que gobierna toda esta pieza: si algo
   * falla —red, permiso, coordenada rechazada— se avisa y se sigue igual al
   * cobro. El pedido es lo urgente; la dirección es la mejora de mañana.
   */
  async function saveAddress(captured: {
    lat: number
    lng: number
    accuracyM: number | null
    reference?: string
  }) {
    setCaptureBusy(true)
    setActionError(null)
    try {
      await api.post(`/driver/orders/${id}/address`, {
        lat: captured.lat,
        lng: captured.lng,
        accuracyM: captured.accuracyM,
        reference: captured.reference,
      })
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? `No se guardó la ubicación: ${err.problem.detail ?? err.message}`
          : 'No se guardó la ubicación. El pedido se puede entregar igual.',
      )
    } finally {
      setCaptureBusy(false)
      setCaptureOpen(false)
      // Solo se encadena al cobro cuando la captura fue el PASO PREVIO a
      // entregar. Un ajuste voluntario termina donde empezó: el motorizado
      // corrigió el pin y sigue con lo suyo.
      //
      // Y cuando sí encadena, lo hace PASE LO QUE PASE: que la dirección no se
      // guardara no puede dejarlo sin poder cerrar la entrega.
      if (captureIntent === 'before_deliver') setDeliverOpen(true)
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

  const businessName = detail.business?.name ?? 'Restaurante'
  const customerLabel = detail.order.customerName
    ? `Pedido de ${detail.order.customerName}`
    : `Pedido #${detail.order.shortId}`

  const headerTitle = (
    <div className="flex items-center gap-1.5 min-w-0 text-sm sm:text-base font-bold">
      <span className="truncate text-ink">{businessName}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
      <span className="truncate text-ink-muted font-medium">{customerLabel}</span>
    </div>
  )

  if (mode === 'delivered') {
    return (
      <main className="mx-auto min-h-dvh max-w-[480px] bg-surface px-4 pb-10">
        <ScreenHeader title={headerTitle} onBack={() => router.push('/')} />
        <DeliveredScreen detail={detail} justDelivered={false} />
      </main>
    )
  }

  // Gates de la bandeja en preview (HU-D-013 / HU-D-014).
  const isUpcoming =
    detail.order.appearsInQueueAt != null && Date.parse(detail.order.appearsInQueueAt) > now
  // MISMO helper que la bandeja, no una copia. Esta pantalla repetía la regla
  // en línea y por tanto se quedaba con la vieja —la que también miraba
  // `urgent_since`— cada vez que la bandeja cambiaba de criterio.
  const esUrgente = isOverdue(detail.order.estimatedReadyAt, now)
  const blockedByOverdue = mode === 'preview' && board.hasOverdueAvailable && !esUrgente
  const blockedByCapacity = mode === 'preview' && board.mySlots >= 3

  // ── Captura de la dirección (0147) ─────────────────────────────────────────
  //
  // SOLO EN PEDIDOS MANUALES. Un pedido B2C trae la dirección de la libreta del
  // cliente (`customer_addresses`), que es otra tabla y es del cliente: dejar
  // que el motorizado la reescriba sería editarle la libreta a alguien que no
  // se lo pidió. El RPC lo rechaza igual, pero la pantalla ni lo ofrece.
  const hasCoords =
    detail.order.deliveryCoordinatesLat != null && detail.order.deliveryCoordinatesLng != null

  /** Se interpone antes de cobrar: es manual y nadie sabe dónde queda la casa. */
  const needsAddressCapture = detail.order.isManual && !hasCoords

  /** Ofrecido, no impuesto: ya hay ubicación pero puede estar mal puesta. */
  const canAdjustAddress = detail.order.isManual && hasCoords

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface pb-48">
      <ScreenHeader title={headerTitle} onBack={() => router.push('/')} />

      <div className="flex-1 px-4 pt-1.5">
        {mode === 'preview' && <PreviewSection detail={detail} now={now} />}

        {/* CADA PASO ENSEÑA LO QUE ESE PASO PERMITE HACER.
            Los tres momentos pintaban casi lo mismo, así que la pantalla no
            ayudaba a distinguir en cuál estabas — y la tarjeta del board ya da
            el preview completo del pedido, así que repetirlo aquí no aporta.

            Lo que se cayó de cada uno, y por qué:
              · «Voy al local» ya no enseña el COBRO. Faltan veinte minutos para
                tocar dinero y no hay nada que hacer con ese número mientras
                conduces. El destino SÍ se queda: saber si la entrega cae al
                lado o al otro extremo del pueblo cambia cómo te organizas, y
                por eso `DestinationCard` se pensó para verse ya en el trayecto.
              · «En el local» pierde el destino y el bloque de cobro entero, y
                gana lo único de dinero que se puede resolver desde el mostrador:
                conseguir el vuelto. Ahí lo que importa es qué recoges —por eso
                el detalle se abre solo— y cuánto llevas esperando. */}
        {mode === 'heading' && (
          <>
            <StatusHero detail={detail} />
            <BusinessCard business={detail.business} />
            <DestinationCard detail={detail} />
          </>
        )}

        {mode === 'waiting' && (
          <>
            <StatusHero detail={detail} />
            {detail.order.waitingAtRestaurantAt && (
              <WaitTimer since={detail.order.waitingAtRestaurantAt} now={now} />
            )}
            <ChangeHeadsUp detail={detail} />
            <BusinessCard business={detail.business} />
            <DestinationCard detail={detail} />
          </>
        )}

        {mode === 'picked_up' && (
          <>
            <StatusHero detail={detail} />
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
          <div className="flex w-full flex-col items-center gap-1.5">
            <Button className="w-full" disabled={busy} onClick={() => run('arrived')}>
              {busy ? 'Un momento…' : 'Llegué al local'}
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReleaseOpen(true)}
              className="mx-auto py-1 text-xs font-semibold text-danger/80 hover:text-danger hover:underline active:opacity-70 transition-colors"
            >
              Soltar pedido
            </button>
          </div>
        )}

        {mode === 'waiting' && (
          <div className="flex w-full flex-col items-center gap-1.5">
            <Button className="w-full" disabled={busy} onClick={() => setPickupOpen(true)}>
              Ya recogí el pedido
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReleaseOpen(true)}
              className="mx-auto py-1 text-xs font-semibold text-danger/80 hover:text-danger hover:underline active:opacity-70 transition-colors"
            >
              Soltar pedido
            </button>
          </div>
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
                  let coords: {
                    lat: number | null
                    lng: number | null
                    accuracy_m: number | null
                  } = {
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
              <div className="flex w-full flex-col gap-2">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    // EL GATE DE LA DIRECCIÓN. Solo se interpone cuando de
                    // verdad hace falta: pedido MANUAL y sin ubicación guardada.
                    // Un pedido con coordenadas ya le dio el mapa al motorizado,
                    // y uno B2C trae la dirección de la libreta del cliente, que
                    // no es del negocio y el RPC ni deja tocar.
                    //
                    // Es un paso ANTES de cobrar, no dentro: si se salta o
                    // falla, la entrega sigue su curso igual.
                    if (needsAddressCapture) {
                      setCaptureIntent('before_deliver')
                      setCaptureOpen(true)
                    } else {
                      setDeliverOpen(true)
                    }
                  }}
                >
                  Pedido entregado
                </Button>

                {/* Ajuste voluntario: el pedido YA trae ubicación pero el
                    motorizado ve que el pin no está en la puerta. Sin esto, la
                    única forma de corregir una dirección mala sería que nadie
                    la corrigiera nunca. */}
                {canAdjustAddress && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setCaptureIntent('adjust')
                      setCaptureOpen(true)
                    }}
                    className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-[13px] font-semibold text-ink-muted transition-transform active:scale-[0.98]"
                  >
                    <Icon name="edit_location_alt" size={16} />
                    Ajustar la ubicación guardada
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </BottomActionBar>

      {waToast && (
        <div className="fixed top-14 inset-x-4 z-50 flex items-center justify-between rounded-2xl bg-ink p-4 text-white shadow-xl animate-t-slide-up">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
              <Icon name="mail" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-body">
                {waToast.templateId === 'on_the_way'
                  ? '¿Avisar que vas en camino?'
                  : '¿Avisar que ya llegaste?'}
              </p>
              <p className="text-caption text-white/70 truncate">{waToast.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <Button
              size="sm"
              /* `bg-none` apaga el degradado de la variante `brand`: es
                 `background-image` y se pinta encima del color. Ver la nota de
                 `customer-card`. */
              className="bg-none bg-[#25D366] text-white shadow-none hover:bg-[#1ebd5a]"
              onClick={() => {
                const url = waLink(waToast.phone, waToast.text)
                if (url) window.open(url, '_blank', 'noopener,noreferrer')
                setWaToast(null)
              }}
            >
              Enviar
            </Button>
            <button
              type="button"
              onClick={() => setWaToast(null)}
              aria-label="Cerrar aviso"
              className="text-white/60 hover:text-white p-1"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      )}

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
          onConfirm={({ slots }) => run('pickup', { slots })}
          onClose={() => setPickupOpen(false)}
        />
      )}

      {captureOpen && (
        <AddressCaptureSheet
          initialLat={detail.order.deliveryCoordinatesLat}
          initialLng={detail.order.deliveryCoordinatesLng}
          initialReference={detail.order.deliveryReference}
          hasDirectoryRow={detail.order.addressDirectoryId != null}
          busy={captureBusy}
          onConfirm={saveAddress}
          onSkip={() => {
            setCaptureOpen(false)
            // Omitir la ubicación NO cancela la entrega. Era el paso previo al
            // cobro, así que el cobro sigue.
            if (captureIntent === 'before_deliver') setDeliverOpen(true)
          }}
        />
      )}

      {deliverOpen && (
        <DeliverSheet
          detail={detail}
          busy={busy}
          // El cobro real viaja entero, no solo el método: los importes son lo
          // que decide el corte de caja (0140/0141).
          onConfirm={(payment) => run('deliver', { ...payment })}
          onNoShow={() => run('no_show')}
          onClose={() => setDeliverOpen(false)}
        />
      )}

      {incidentOpen && <IncidentSheet orderId={id} onClose={() => setIncidentOpen(false)} />}

      {releaseOpen && (
        <ReleaseSheet
          busy={busy}
          onConfirm={async (reason, note) => {
            await run('release', { reason, note })
            setReleaseOpen(false)
          }}
          onClose={() => setReleaseOpen(false)}
        />
      )}
    </main>
  )
}

function LostScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/[0.08] text-ink-subtle">
        <Icon name="close" size={30} />
      </span>
      <h1 className="mt-5 font-display text-[24px] font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-[14px] text-ink/55">{body}</p>
      <Button as="a" href="/" variant="brand" className="mt-6 w-full">
        Volver al inicio
      </Button>
    </main>
  )
}
