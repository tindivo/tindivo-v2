'use client'

import { ApiError } from '@tindivo/api-client'
import type {
  DriverCourierDetail,
  DriverCourierEndpointView,
  DriverCourierOrderView,
  DriverCourierStepRequest,
} from '@tindivo/contracts'
import { BottomActionBar, Button, Card, cn, Icon, ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { notifyDriverSuccess } from '@/components/driver-toast'
import { CourierWhatsAppSheet } from '@/components/entrega/courier-whatsapp-sheet'
import {
  CourierAcceptClock,
  CourierAcceptClockNote,
  CourierElapsed,
  CourierExpiryWarning,
} from '@/components/home/courier-accept-clock'
import { COURIER_ACCENT, isPicked, moneyLine } from '@/components/home/courier-card'
import {
  errorText,
  needsPayment,
  PaymentSheet,
  ProblemSheet,
  sendStep,
} from '@/components/home/courier-steps'
import { MapSheet } from '@/components/order/map-sheet'
import { WhatsAppGlyph } from '@/components/whatsapp-glyph'
import { api } from '@/lib/api'
import { courierCategory } from '@/lib/courier-category'
import { isValidPePhone, telLink } from '@/lib/deeplinks'
import { prettyPhone } from '@/lib/format'
import { createDriverAudioTrigger } from '@/lib/sound'

/**
 * La ficha de una entrega: una página, como la de la comida (`/pedido/[id]`),
 * y no una hoja. Lo que la tarjeta calla —quién entrega y quién recibe, sus
 * celulares, el mapa de cada punto, las indicaciones— y los pasos en botones.
 *
 * CADA PUNTO, SU TARJETA. Como «Recoges en» y «Entregar en» de la comida, con
 * el pin del color del tablero (verde recojo, rojo destino) para no tener que
 * leer el rótulo. «Ver mapa» abre primero el mapa en una hoja, igual que la
 * comida; desde ahí se salta a Google Maps.
 */

type Sheet =
  | 'problem'
  | { payment: 'pick_up' | 'deliver' }
  | { map: 'origin' | 'destination' }
  | { whatsapp: 'origin' | 'destination' }
  | { whatsapp: 'origin' | 'destination' }

export default function EntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [detail, setDetail] = useState<DriverCourierDetail | null>(null)
  const [gone, setGone] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: DriverCourierDetail }>(`/driver/courier-orders/${id}`)
      setDetail(res.data)
      setGone(false)
      setLoadError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setGone(true)
        return
      }
      setLoadError(errorText(err, 'No se pudo cargar'))
    }
  }, [id])

  useEffect(() => {
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Mientras está por aceptar, otro puede llevársela: se nota sin recargar.
    // Solo con la pantalla a la vista: con el celular bloqueado cada vuelta
    // gastaba datos y batería para pintar algo que nadie mira, y al volver
    // `visibilitychange` ya recarga.
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(poll)
    }
  }, [load])

  const back = () => (window.history.length > 1 ? router.back() : router.push('/'))

  if (gone || (detail && detail.order.status === 'cancelled')) {
    return (
      <Lost
        title="Esta entrega ya no está disponible"
        body="Se canceló o la aceptó otro motorizado."
      />
    )
  }
  if (!detail) {
    if (loadError) return <Lost title="No pudimos cargar la entrega" body={loadError} />
    return (
      <main className="mx-auto max-w-[480px] px-4 pt-6">
        <div className="h-[140px] animate-pulse rounded-2xl bg-surface-low" />
        <div className="mt-3.5 h-[160px] animate-pulse rounded-2xl bg-surface-low" />
      </main>
    )
  }

  const { order, mine } = detail
  const picked = isPicked(order)
  const delivered = order.status === 'delivered'

  /** Un paso. `true` si salió bien. Tras entregar, soltar o fallar, vuelve al tablero. */
  async function run(body: DriverCourierStepRequest): Promise<boolean> {
    const sound =
      body.step === 'accept'
        ? createDriverAudioTrigger('orderTaken')
        : body.step === 'deliver'
          ? createDriverAudioTrigger('orderDelivered')
          : null
    setBusy(true)
    setError(null)
    try {
      await sendStep(order.id, body)
      sound?.()
      if (body.step === 'deliver') {
        notifyDriverSuccess('Entrega completada')
        router.replace('/')
      } else if (body.step === 'release' || body.step === 'fail') {
        router.replace('/')
      } else {
        await load()
      }
      return true
    } catch (err) {
      setError(errorText(err, 'No se pudo guardar. Intenta de nuevo.'))
      await load()
      return false
    } finally {
      setBusy(false)
    }
  }

  function advance() {
    const step = picked ? 'deliver' : 'pick_up'
    if (needsPayment(order, step)) {
      setError(null)
      setSheet({ payment: step })
    } else void run({ step })
  }

  const mapPoint = sheet && typeof sheet === 'object' && 'map' in sheet ? order[sheet.map] : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface pb-48">
      <ScreenHeader
        title={
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold sm:text-base">
            <span className="text-ink">Entrega</span>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: COURIER_ACCENT }}
            />
            <span className="truncate font-medium text-ink-muted">{order.requesterName}</span>
          </div>
        }
        onBack={back}
      />

      <div className="flex-1 px-4 pt-1.5">
        <Hero order={order} mine={mine} />
        <ItemCard order={order} mine={mine} />

        <RouteCard
          order={order}
          mine={mine}
          onMap={(which) => setSheet({ map: which })}
          onWhatsApp={(which) => setSheet({ whatsapp: which })}
        />

        {error && <p className="mt-3 px-1 text-[13px] text-danger">{error}</p>}
      </div>

      {!delivered && (
        <BottomActionBar>
          {/* Lo que hay que cobrar, pegado al botón que lo dispara: es lo que
              se olvida en la puerta. */}
          {!order.transportCollected && (
            <p className="mb-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-body font-bold text-amber-900">
              <Icon name="payments" size={18} filled className="shrink-0" />
              Cobrar
              <span className="font-mono tabular-nums">S/ {order.feeAmount.toFixed(2)}</span>{' '}
              {order.payer === 'origin' ? 'al recoger' : 'al entregar'}
            </p>
          )}
          {!mine ? (
            <Button className="w-full" disabled={busy} onClick={() => void run({ step: 'accept' })}>
              {busy ? 'Aceptando…' : 'Aceptar entrega'}
            </Button>
          ) : (
            <div className="flex w-full flex-col items-center gap-1.5">
              <Button className="w-full" disabled={busy} onClick={advance}>
                {busy ? 'Un momento…' : picked ? 'Entregado' : 'Ya recogí'}
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setSheet('problem')
                }}
                className="mx-auto py-1 text-xs font-semibold text-danger/80 transition-colors hover:text-danger hover:underline active:opacity-70"
              >
                No se pudo
              </button>
            </div>
          )}
        </BottomActionBar>
      )}

      {mapPoint && sheet && typeof sheet === 'object' && 'map' in sheet && (
        <MapSheet
          lat={mapPoint.coordinates.lat}
          lng={mapPoint.coordinates.lng}
          title={mapPoint.referenceText}
          subtitle={mapPoint.name}
          eyebrow={sheet.map === 'origin' ? 'Recoger en' : 'Entregar en'}
          // A y B juntos, con sus nombres, como los ve el cliente al seguir
          // su entrega: el punto que se abrió y el otro extremo del viaje.
          pinLabel={mapPoint.name}
          variant={sheet.map}
          other={(() => {
            const o = order[sheet.map === 'origin' ? 'destination' : 'origin']
            return {
              lat: o.coordinates.lat,
              lng: o.coordinates.lng,
              label: o.name,
              variant: sheet.map === 'origin' ? 'destination' : 'origin',
            }
          })()}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && typeof sheet === 'object' && 'payment' in sheet && (
        <PaymentSheet
          fee={order.feeAmount}
          error={error}
          busy={busy}
          onClose={() => setSheet(null)}
          onPick={async (method) => {
            if (await run({ step: sheet.payment, paymentMethod: method })) setSheet(null)
          }}
        />
      )}
      {sheet && typeof sheet === 'object' && 'whatsapp' in sheet && (
        <CourierWhatsAppSheet order={order} point={sheet.whatsapp} onClose={() => setSheet(null)} />
      )}
      {sheet === 'problem' && (
        <ProblemSheet
          order={order}
          error={error}
          busy={busy}
          onClose={() => setSheet(null)}
          onRelease={async () => {
            await run({ step: 'release' })
          }}
          onFail={async (reason) => {
            await run({ step: 'fail', failReason: reason })
          }}
        />
      )}
    </main>
  )
}

/** Los tres pasos de la entrega, en el orden del viaje. */
const STEPS = ['Aceptada', 'Recogida', 'Entregada'] as const

/** Cuántos pasos ya se dieron: 0 por aceptar · 1 aceptada · 2 recogida · 3 entregada. */
function stepsDone(order: DriverCourierOrderView, mine: boolean): number {
  if (!mine) return 0
  if (order.status === 'delivered') return 3
  return isPicked(order) ? 2 : 1
}

/**
 * EL HERO, CON EL MISMO LENGUAJE QUE EL DE LA COMIDA (`order/status-hero`):
 * bloque oscuro, la píldora de quién es, el título grande y el paso a paso
 * abajo. El degradado acaba en el AZUL de Entregas y no en el naranja, para que
 * de un vistazo se sepa cuál de las dos fichas tienes delante.
 *
 * Con el encargo encima y por cobrar a quien recibe, el título pasa a ser la
 * cifra: igual que en la comida, es el momento en que se decide la plata.
 */
function Hero({ order, mine }: { order: DriverCourierOrderView; mine: boolean }) {
  const done = stepsDone(order, mine)
  const collecting = done === 2 && order.payer === 'destination' && !order.transportCollected
  const heading = collecting
    ? `S/ ${order.feeAmount.toFixed(2)}`
    : !mine
      ? 'Por aceptar'
      : done === 3
        ? 'Entregada'
        : done === 2
          ? 'Llévala al destino'
          : 'Ve a recoger'
  const sub = collecting
    ? null
    : done === 1
      ? order.origin.referenceText
      : done === 2
        ? order.destination.referenceText
        : null

  return (
    <div className="relative mt-2 overflow-hidden rounded-[22px] bg-gradient-to-br from-ink via-ink to-blue-800 px-5 py-[22px] text-white shadow-elev-3">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-[160px] w-[160px] translate-x-10 -translate-y-10 rounded-full bg-blue-500/40 opacity-40 blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/[0.14] px-3 py-1 text-xs font-semibold text-white/90">
          <Icon name="local_shipping" size={13} filled className="shrink-0 text-blue-300" />
          <span>Entrega</span>
          <span className="text-white/40">•</span>
          <span className="truncate">Pedido de {order.requesterName}</span>
        </span>
        {mine && done < 3 && order.acceptedAt && (
          <div className="flex shrink-0 flex-col items-end">
            <CourierElapsed since={order.acceptedAt} onDark />
            <span className="text-micro text-white/50">desde que aceptaste</span>
          </div>
        )}
        {!mine && order.acceptDeadline && (
          <CourierAcceptClock deadline={order.acceptDeadline} onDark />
        )}
      </div>

      <div className="relative mt-3">
        {collecting && (
          <p className="font-mono text-meta uppercase tracking-[0.14em] text-white/60">
            Cobrar al entregar
          </p>
        )}
        <p
          className={cn(
            'font-display font-bold tracking-tight',
            collecting ? 'mt-1 font-mono text-display tabular-nums' : 'text-display',
          )}
        >
          {heading}
        </p>
        {sub && <p className="mt-1 text-body text-white/70">{sub}</p>}
      </div>

      <Stepper done={done} />
    </div>
  )
}

/** Aceptada → Recogida → Entregada, con la misma mano que el de la comida. */
function Stepper({ done }: { done: number }) {
  return (
    <section className="relative mt-[18px]" aria-label="Pasos de la entrega">
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
                i <= done ? 'bg-blue-500 ring-2 ring-blue-500/25' : 'bg-white/[0.12]',
              )}
            >
              {i < done ? (
                <span className="text-white">
                  <Icon name="check" size={20} />
                </span>
              ) : (
                <span
                  className={cn('h-2 w-2 rounded-full', i === done ? 'bg-white' : 'bg-white/40')}
                />
              )}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  'mx-1 h-0.5 flex-1 rounded-full',
                  i < done ? 'bg-blue-500' : 'bg-white/15',
                )}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn(
              'font-mono text-micro uppercase tracking-widest',
              i === done ? 'text-blue-300' : 'text-white/60',
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Qué llevas y cuánto cobras, en una tarjeta blanca justo bajo el hero. */
function ItemCard({ order, mine }: { order: DriverCourierOrderView; mine: boolean }) {
  const money = moneyLine(order)
  // Si el hero ya enseña la cifra a cobrar, repetirla aquí sería ruido.
  const heroShowsMoney =
    stepsDone(order, mine) === 2 && order.payer === 'destination' && !order.transportCollected
  const cat = courierCategory(order.itemDescription)
  return (
    <Card className="mt-3 p-4">
      {!mine && order.acceptDeadline && (
        <div className="mb-3">
          <CourierExpiryWarning deadline={order.acceptDeadline} />
          <CourierAcceptClockNote createdAt={order.createdAt} deadline={order.acceptDeadline} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon name={cat.icon} size={20} filled />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Llevas
          </span>
          <p className="text-body font-semibold leading-tight text-ink">
            {cat.label}
            {cat.detail && <span className="font-normal text-ink-muted"> · {cat.detail}</span>}
          </p>
        </div>
        {order.isFragile && (
          <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-meta font-bold text-danger">
            Frágil
          </span>
        )}
      </div>
      {order.driverNote && (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-body font-semibold leading-snug text-ink">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-warning" filled />
          {order.driverNote}
        </p>
      )}
      {!heroShowsMoney && (
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink/[0.06] pt-3">
          <p
            className={cn(
              'text-body font-medium',
              order.transportCollected ? 'text-success' : 'text-ink-muted',
            )}
          >
            Transporte · {money.detail}
          </p>
          <p
            className={cn(
              'font-mono text-lead font-bold tabular-nums',
              order.transportCollected ? 'text-success' : 'text-ink',
            )}
          >
            {money.headline}
          </p>
        </div>
      )}
    </Card>
  )
}

/**
 * EL TRAYECTO EN UNA TARJETA, como en el tablero: los dos puntos unidos por la
 * línea, verde el recojo y rojo el destino. Eran dos tarjetas con tres botones
 * grandes cada una y ocupaban la pantalla entera.
 *
 * Lo que toca ahora lleva «Ahora»; lo ya recogido queda apagado con su ✓, pero
 * con sus botones: si algo sale mal hay que poder llamar a quien lo entregó.
 */
function RouteCard({
  order,
  mine,
  onMap,
  onWhatsApp,
}: {
  order: DriverCourierOrderView
  mine: boolean
  onMap: (which: 'origin' | 'destination') => void
  onWhatsApp: (which: 'origin' | 'destination') => void
}) {
  const done = stepsDone(order, mine)
  const stops = [
    {
      which: 'origin' as const,
      label: 'Recoges en',
      point: order.origin,
      passed: done >= 2,
      now: done === 1,
    },
    {
      which: 'destination' as const,
      label: 'Entregas en',
      point: order.destination,
      passed: done >= 3,
      now: done === 2,
    },
  ]

  return (
    <Card className="mt-3 p-4">
      <ol className="flex flex-col">
        {stops.map((s, i) => {
          const last = i === stops.length - 1
          const origin = s.which === 'origin'
          return (
            <li key={s.which} className="flex gap-3">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <Icon
                  name={s.passed ? 'check_circle' : 'location_on'}
                  size={24}
                  filled
                  className={origin ? 'text-emerald-600' : 'text-danger'}
                />
                {!last && <span aria-hidden className="my-1 w-0.5 flex-1 rounded-full bg-ink/15" />}
              </div>
              <div className={cn('min-w-0 flex-1', !last && 'pb-4', s.passed && 'opacity-60')}>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    {s.passed ? (origin ? 'Recogido en' : 'Entregado en') : s.label}
                  </span>
                  {s.now && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">
                      Ahora
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-body-lg font-semibold leading-snug text-ink">
                  {s.point.referenceText}
                </p>
                <p className="mt-0.5 truncate text-caption text-ink-muted">
                  {s.point.name}
                  {s.point.phone && (
                    <span className="font-mono"> · {prettyPhone(s.point.phone)}</span>
                  )}
                </p>
                <StopActions
                  point={s.point}
                  onMap={() => onMap(s.which)}
                  onWhatsApp={() => onWhatsApp(s.which)}
                />
              </div>
            </li>
          )
        })}
      </ol>
      {!mine && (
        <p className="mt-3 flex items-start gap-2 border-t border-ink/[0.06] pt-3 text-caption text-ink-muted">
          <Icon name="call" size={14} className="mt-0.5 shrink-0" />
          Al aceptarla verás los celulares. Antes de salir, llama a quien entrega para confirmar que
          está listo.
        </p>
      )}
    </Card>
  )
}

/**
 * Llamar · WhatsApp · Mapa, en una fila de botones bajos. Sin celular (una
 * entrega por aceptar) solo queda el mapa. El mapa se abre primero en una
 * hoja, y desde ahí se salta a Google Maps.
 */
function StopActions({
  point,
  onMap,
  onWhatsApp,
}: {
  point: DriverCourierEndpointView
  onMap: () => void
  onWhatsApp: () => void
}) {
  const pill =
    'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-caption font-bold active:scale-95 transition-transform'
  const phone = isValidPePhone(point.phone) ? point.phone : null
  return (
    <div className="mt-2.5 flex gap-2">
      {phone && (
        <a
          href={telLink(phone)}
          aria-label={`Llamar a ${point.name}`}
          className={cn(pill, 'border border-ink/10 bg-card text-ink')}
        >
          <Icon name="phone" size={16} />
          Llamar
        </a>
      )}
      {phone && (
        <button
          type="button"
          onClick={onWhatsApp}
          aria-label={`WhatsApp a ${point.name}`}
          className={cn(pill, 'bg-[#25D366] text-white')}
        >
          <WhatsAppGlyph className="h-3.5 w-3.5 fill-current" />
          WhatsApp
        </button>
      )}
      <button type="button" onClick={onMap} className={cn(pill, 'bg-ink/[0.06] text-ink')}>
        <Icon name="map" size={16} />
        {phone ? 'Mapa' : 'Ver mapa'}
      </button>
    </div>
  )
}

function Lost({ title, body }: { title: string; body: string }) {
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
