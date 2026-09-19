'use client'

import { ApiError } from '@tindivo/api-client'
import { canalUnico } from '@tindivo/supabase'
import { BottomActionBar, Button, Icon, ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { notifyDriverSuccess } from '@/components/driver-toast'
import { BusinessCard } from '@/components/order/business-card'
import { ChangeHeadsUp } from '@/components/order/change-heads-up'
import { DeliveredScreen } from '@/components/order/delivered-screen'
import { DestinationCard } from '@/components/order/destination-card'
import { IncidentSheet } from '@/components/order/incident-sheet'
import { MomentPickedUp } from '@/components/order/moment-picked-up'
import { OrderDetail } from '@/components/order/order-detail'
import { type OrderSheet, OrderSheets } from '@/components/order/order-sheets'
import { PreviewSection } from '@/components/order/preview-section'
import { StatusHero } from '@/components/order/status-hero'
import { WaitTimer } from '@/components/order/wait-timer'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { isValidPePhone, waLink } from '@/lib/deeplinks'
import { quickPosition } from '@/lib/geo'
import { getOptimistic } from '@/lib/offline-queue'
import { deliveredMessage } from '@/lib/orders/delivered-message'
import { prematureMinutes } from '@/lib/orders/phase'
import { createDriverAudioTrigger } from '@/lib/sound'
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

  /** La hoja abierta (recogida adelantada, cobro, soltar, dirección). Ver `OrderSheets`. */
  const [sheet, setSheet] = useState<OrderSheet | null>(null)
  const [incidentOpen, setIncidentOpen] = useState(false)

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

  /** `true` si salió bien: las hojas se cierran solo entonces. */
  async function run(action: string, params: Record<string, unknown> = {}): Promise<boolean> {
    const triggerTakenSound = action === 'take' ? createDriverAudioTrigger('orderTaken') : null
    const triggerDeliveredSound =
      action === 'deliver' ? createDriverAudioTrigger('orderDelivered') : null
    setActionError(null)
    setBusy(true)
    try {
      const result = await postTransition(id, action, params)
      if (action === 'take') {
        triggerTakenSound?.()
      }
      if (action === 'deliver') {
        triggerDeliveredSound?.()
        const msg = detail ? deliveredMessage(detail.order, params) : 'Pedido entregado con éxito'

        notifyDriverSuccess(msg)
        router.replace('/')
        return true
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

      if (result === 'ok') {
        // NO SE ESPERA AL GET. Antes cada «ok» eran dos viajes seguidos —el POST
        // y luego `load()`— antes de que la pantalla cambiara: 1-1,5 s en la
        // señal del pueblo. El POST ya dijo que salió bien, así que el paso
        // nuevo se pinta ahora y `load()` solo reconcilia por detrás.
        //
        // `take` queda fuera: el detalle de una vista previa no trae todo lo que
        // la ficha completa necesita (teléfono, dirección), así que ahí sí se
        // espera a lo que devuelve el servidor.
        const at = new Date().toISOString()
        if (action === 'take') {
          await load()
        } else {
          setDetail((d) => {
            if (!d) return d
            if (action === 'arrived') {
              return {
                ...d,
                order: { ...d.order, status: 'waiting_at_restaurant', waitingAtRestaurantAt: at },
              }
            }
            if (action === 'pickup') {
              return { ...d, order: { ...d.order, status: 'picked_up', pickedUpAt: at } }
            }
            if (action === 'arrived_customer') {
              return { ...d, order: { ...d.order, arrivedAtCustomerAt: at } }
            }
            return d
          })
          void load()
        }
      } else {
        // Encolado offline: reflejar el avance optimista sin red.
        setDetail((d) => (d ? { ...d, order: { ...d.order, status: d.order.status } } : d))
      }
      return true
    } catch (err) {
      setActionError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo completar',
      )
      return false
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
        <ScreenHeader
          title={headerTitle}
          onBack={() => (window.history.length > 1 ? router.back() : router.push('/historial'))}
        />
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
              onClick={() => setSheet('release')}
              className="mx-auto py-1 text-xs font-semibold text-danger/80 hover:text-danger hover:underline active:opacity-70 transition-colors"
            >
              Soltar pedido
            </button>
          </div>
        )}

        {mode === 'waiting' && (
          <div className="flex w-full flex-col items-center gap-1.5">
            {/* SIN HOJA POR DEFECTO. Antes eran dos preguntas seguidas («¿ya está
                listo?» y «Confirmar recogida») antes de un paso que el servidor
                no condiciona a nada. Solo se para si la recogida es PREMATURA:
                la hora no llegó y la cocina no marcó listo, que es cuando uno
                puede llevarse un pedido que no es el suyo. */}
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => {
                const early = prematureMinutes(
                  {
                    estimated_ready_at: detail.order.estimatedReadyAt,
                    ready_early_used: detail.order.readyEarlyUsed,
                  },
                  now,
                )
                if (early > 0) setSheet('pickup')
                else void run('pickup', { slots: 1 })
              }}
            >
              {busy ? 'Un momento…' : 'Ya recogí el pedido'}
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSheet('release')}
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
                  // Hasta 2 s de GPS, no 5: ver `quickPosition`. Sin fix la
                  // llegada se registra igual, con coordenadas nulas.
                  const coords = await quickPosition()
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
                    setSheet(needsAddressCapture ? 'capture:before_deliver' : 'deliver')
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
                    onClick={() => setSheet('capture:adjust')}
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

      <OrderSheets
        orderId={id}
        detail={detail}
        sheet={sheet}
        onSheet={setSheet}
        now={now}
        busy={busy}
        onAct={run}
        onReload={load}
        onError={setActionError}
      />

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
      <h1 className="mt-5 font-display text-[24px] font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-[14px] text-ink/55">{body}</p>
      <Button as="a" href="/" variant="brand" className="mt-6 w-full">
        Volver al inicio
      </Button>
    </main>
  )
}
