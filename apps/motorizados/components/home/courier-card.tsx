'use client'

import type { DriverCourierOrderView } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'
import { hourOf } from '@/lib/format'
import { CourierAcceptClock, CourierElapsed, CourierExpiryWarning } from './courier-accept-clock'

/**
 * Tarjeta de Tindivo Entregas en el board. MISMA PIEL QUE `OrderCard` —blanca,
 * franja a la izquierda, cejilla en versalita gris, la cifra en mono abajo—
 * para que la bandeja se lea como una sola cosa, y se arrastra igual
 * (`SwipeCard`). Lo que la distingue de la comida es poco y constante: la
 * franja azul, la insignia «Entrega» con el camión y el trayecto A → B.
 *
 * EL TRAYECTO COMO EN INDRIVE: dos puntos y una línea que los une. Sin
 * «Recoger» ni «Llevar»: el punto verde arriba y el rojo abajo ya lo dicen, y
 * el rótulo le robaba una línea a cada dirección. Los contactos y los botones
 * de llamar viven en la ficha, que se abre tocando la tarjeta.
 */

/** Azul de Entregas: no lo usa la comida, así que no hay con qué confundirlo. */
export const COURIER_ACCENT = '#2563eb'

const PICKED = new Set(['picked_up', 'heading_to_dropoff'])

export function isPicked(o: Pick<DriverCourierOrderView, 'status'>): boolean {
  return PICKED.has(o.status)
}

/** Lo que dice la cifra de abajo: cuánto, y si falta cobrarlo o ya se cobró. */
export function moneyLine(o: DriverCourierOrderView): { headline: string; detail: string } {
  const headline = `S/ ${o.feeAmount.toFixed(2)}`
  if (o.transportCollected) {
    const how = o.paymentMethod === 'yape' ? 'Yape' : o.paymentMethod === 'cash' ? 'efectivo' : null
    return { headline, detail: how ? `Cobrado · ${how}` : 'Cobrado' }
  }
  return {
    headline,
    detail: o.payer === 'origin' ? 'Cobrar al recoger' : 'Cobrar al entregar',
  }
}

/**
 * Los dos puntos y la línea. `compact` es la tarjeta (solo la referencia, que
 * en un pueblo sin numeración ES la dirección); sin él es la ficha, que añade
 * el nombre y lo que cuelgue de cada punto (`renderExtra`: llamar, cómo llegar).
 */
export function CourierRoute({
  order,
  compact = false,
  renderExtra,
}: {
  order: DriverCourierOrderView
  compact?: boolean
  renderExtra?: (
    point: DriverCourierOrderView['origin'],
    which: 'origin' | 'destination',
  ) => React.ReactNode
}) {
  const stops = [
    { which: 'origin' as const, point: order.origin },
    { which: 'destination' as const, point: order.destination },
  ]
  return (
    <ol className="flex flex-col">
      {stops.map(({ which, point }, i) => {
        const last = i === stops.length - 1
        return (
          <li key={which} className="flex gap-2.5">
            {/* La columna del pin: el pin, y debajo la línea hasta el siguiente. */}
            <div className="flex w-[18px] shrink-0 flex-col items-center">
              <Icon
                name="location_on"
                size={18}
                filled
                className={which === 'origin' ? 'text-emerald-600' : 'text-danger'}
                aria-label={which === 'origin' ? 'Recojo' : 'Entrega'}
              />
              {!last && <span aria-hidden className="my-0.5 w-0.5 flex-1 rounded-full bg-ink/15" />}
            </div>
            <div className={cn('min-w-0 flex-1', !last && (compact ? 'pb-2' : 'pb-4'))}>
              <p
                className={cn(
                  'leading-snug text-ink',
                  compact ? 'line-clamp-2 text-body font-medium' : 'text-body-lg font-bold',
                )}
              >
                {point.referenceText}
              </p>
              {!compact && <p className="mt-0.5 text-caption text-ink-muted">{point.name}</p>}
              {renderExtra?.(point, which)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function CourierCard({
  order,
  variant,
  blockedReason,
  onOpen,
}: {
  order: DriverCourierOrderView
  /** `delivered`: el historial. Sin gesto: ya no hay nada que hacer, solo consultar. */
  variant: 'available' | 'mine' | 'delivered'
  blockedReason?: string
  onOpen?: () => void
}) {
  const money = moneyLine(order)
  const picked = isPicked(order)

  return (
    <article
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-ink/10 bg-card py-3.5 pr-3.5 pl-4 text-left shadow-elev-1',
        blockedReason && 'opacity-70',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: COURIER_ACCENT }}
      />

      {/* Un solo objetivo táctil, estirado y encima, como en `OrderCard`. */}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ver entrega de ${order.requesterName}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 active:scale-[0.99]"
        />
      )}

      {variant === 'available' && order.acceptDeadline && (
        <CourierExpiryWarning deadline={order.acceptDeadline} />
      )}

      {/* ── Cejilla: la insignia que la separa de la comida, y el estado ── */}
      <div className="flex items-center gap-1.5 text-micro text-ink-muted">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 font-bold uppercase tracking-[0.08em] text-white">
          <Icon name="local_shipping" size={12} filled />
          Entrega
        </span>
        <span className="shrink-0 font-mono">#{order.shortId}</span>
        {variant === 'mine' && (
          <span
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
              picked ? 'bg-violet-50 text-violet-800' : 'bg-sky-50 text-sky-800',
            )}
          >
            <Icon name={picked ? 'shopping_bag' : 'two_wheeler'} size={12} filled />
            {picked ? 'Llevando' : 'Por recoger'}
          </span>
        )}
        {variant === 'delivered' && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 font-semibold text-ink-muted">
            <Icon name="check_circle" size={12} filled />
            Entregada
            {order.deliveredAt && ` · ${hourOf(order.deliveredAt)}`}
          </span>
        )}
      </div>

      {/* ── Quién pidió, en grande, y a su altura el reloj: cuánto le queda
          antes de cancelarse sola. Mismo sitio que el reloj de la comida. ── */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-lead text-ink tracking-tight">
          {order.requesterName}
        </p>
        {variant === 'mine' && order.acceptedAt && <CourierElapsed since={order.acceptedAt} />}
        {variant === 'available' && order.acceptDeadline && (
          <CourierAcceptClock deadline={order.acceptDeadline} />
        )}
      </div>

      {/* ── El trayecto ── */}
      <div className="mt-2">
        <CourierRoute order={order} compact />
      </div>

      {/* ── Qué se lleva, en una línea fina: no puede gritar más que el trayecto ── */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="flex min-w-0 max-w-full items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-meta font-semibold text-ink-muted">
          <Icon name="inventory_2" size={13} className="shrink-0" />
          <span className="truncate">{order.itemDescription}</span>
        </span>
        {order.isFragile && (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-meta font-bold text-danger">
            Frágil
          </span>
        )}
        {order.driverNote && (
          <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-meta font-semibold text-amber-900">
            <Icon name="info" size={13} className="shrink-0" filled />
            Con indicaciones
          </span>
        )}
      </div>

      {/* ── Cobro, o el motivo del bloqueo en su lugar ── */}
      {blockedReason ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption font-medium text-ink-muted">
          <Icon name="lock" size={14} className="shrink-0" />
          {blockedReason}
        </p>
      ) : (
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'font-mono text-title font-bold leading-none tracking-tight tabular-nums',
              order.transportCollected ? 'text-success' : 'text-ink',
            )}
          >
            {money.headline}
          </p>
          <p
            className={cn(
              'text-caption font-medium',
              order.transportCollected ? 'text-success' : 'text-ink-muted',
            )}
          >
            {money.detail}
          </p>
        </div>
      )}
    </article>
  )
}
