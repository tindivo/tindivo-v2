'use client'

import { cn, Icon } from '@tindivo/ui'
import { formatReadyDelta, type OrderVM } from '@/lib/orders/view-model'
import { formatSupportPhone, normalizeSupportPhone } from '@/lib/support'
import { mmss, PayBadgeMini, SourceBadgeMini, soles } from './primitives'

type CardProps = { order: OrderVM; onOpen?: (o: OrderVM) => void; compact?: boolean }

type CocinaCardProps = CardProps & {
  /** El número de soporte tal cual sale de `app_settings`. La tarjeta lo valida
   *  por su cuenta: no se fía de que llegue ya normalizado. */
  supportPhone?: string | null
  onCallDriver?: (o: OrderVM) => void
}

/** Borde y fondo de la tarjeta según el estado de cocina. Mismo patrón que
 *  `URGENCY_CARD` en motorizados: el estado mapea a clases, no a estilos inline. */
const COOKING_STATE_CARD: Record<string, string> = {
  cooking: 'border border-border bg-white',
  buffer_p1: 'border border-border bg-white',
  buffer_p2: 'border border-[#FDBA74] bg-white',
  buffer_p3: 'border border-[#FCA5A5] bg-white',
  heading: 'border border-border bg-white',
  waiting: 'border-2 border-[#4ADE80] bg-success/[0.025]',
}
const COOKING_STATE_CARD_FALLBACK = 'border border-border bg-white'

const RISK_REASON_LABEL: Record<string, string> = {
  gps_warning_zone: 'Validar · zona ampliada',
  same_phone_burst: 'Validar · varios pedidos',
  nearby_address_burst: 'Validar · direcciones cercanas',
  new_phone_high_ticket_burst: 'Validar · patrón inusual',
  order_spike: 'Validar · pico de pedidos',
  standard_validation_rule: 'Validar antes de cocinar',
}

function RiskBadge({ order }: { order: OrderVM }) {
  if (!order.requiresValidation) return null
  return (
    <div className="mt-1.5 inline-flex items-center gap-[5px] rounded-full bg-warning-soft px-2 py-1 text-[11px] font-bold text-brand-dark">
      <Icon name="shield" size={13} weight={500} filled />
      {RISK_REASON_LABEL[order.validationReasonCode ?? ''] ?? 'Validar antes de cocinar'}
    </div>
  )
}

/** Minutos que faltan para que la comida esté lista (o badge de retraso si readySec < 0). */
function CookingCountdown({ order }: { order: OrderVM }) {
  // Máxima prioridad: si la cajera ya declaró la comida lista, no hay nada que
  // contar. Antes de esto el pedido se quedaba MUDO en `heading` y `waiting`
  // —`minutesLeft` cae a null por `stillCooking`— así que la única señal de
  // "listo" vivía en el panel de detalle y el tablero no la reflejaba.
  if (order.readyEarly) {
    return (
      <span className="inline-flex items-center gap-[3px] text-[11px] font-semibold text-success">
        <Icon name="check_circle" size={12} weight={500} filled className="text-success" />
        Comida lista
      </span>
    )
  }

  if (order.readySec != null && order.readySec < 0) {
    return (
      <span className="inline-flex items-center gap-[3px] rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger border border-danger/20">
        <Icon name="priority_high" size={12} weight={500} filled className="text-danger" />
        ¡Demorado! <span className="font-mono">{formatReadyDelta(order.readySec)}</span>
      </span>
    )
  }

  if (order.minutesLeft != null && order.minutesLeft > 0) {
    return (
      <span className="inline-flex items-center gap-[3px] text-[11px] font-semibold text-brand-dark">
        <Icon name="timer" size={12} weight={500} className="text-brand-dark" />
        <span className="font-mono font-bold">{order.minutesLeft}m</span> en cocina
      </span>
    )
  }

  return null
}

// ── Status line dentro de "En cocina" ─────────────────────────────────────────
export function CookingStatusLine({ order }: { order: OrderVM }) {
  const s = order.state
  const d = order.driver

  if (s === 'cooking') {
    // Misma prioridad que en `CookingCountdown`: `readyEarly` gana sobre todo lo
    // demás. Aquí importa el doble porque en 'cooking' `minutesLeft` NO mira
    // `ready_early_used` (view-model.ts:262-269), así que sin esta guarda la
    // línea diría "Cocinando · Xm restantes" de comida ya lista.
    //
    // Hoy la combinación 'cooking' + readyEarly no parece alcanzable: `ready`
    // con driver NULL manda el pedido a `waiting_driver`, y con driver asignado
    // el estado ya no es 'cooking'. Se cubre igual: la guarda es de una línea y
    // el día que aparezca un camino nuevo, la etiqueta ya estará correcta en vez
    // de mentir en silencio.
    if (order.readyEarly) {
      return (
        <div className="flex items-center gap-[5px]">
          <Icon name="check_circle" size={12} weight={500} filled className="text-success" />
          <span className="text-[11px] font-semibold text-success">Comida lista</span>
        </div>
      )
    }

    if (order.readySec != null && order.readySec < 0) {
      return (
        <div className="flex items-center gap-[5px]">
          <Icon name="priority_high" size={12} weight={500} filled className="text-danger" />
          <span className="text-[11px] font-bold text-danger">
            ¡Demorado! · <span className="font-mono">{formatReadyDelta(order.readySec)}</span>
            {order.extensionUsed && (
              <span className="ml-1 text-amber-700">+{order.extensionMin}m</span>
            )}
          </span>
        </div>
      )
    }

    const left = order.minutesLeft ?? order.prepMinutes ?? 0
    const prep = order.prepMinutes ?? 0
    const pct = prep > 0 ? left / prep : 1
    const timerClass = pct < 0.15 ? 'text-brand-dark' : 'text-ink-subtle'
    return (
      <div className="flex items-center gap-[5px]">
        <Icon name="timer" size={12} weight={500} className={timerClass} />
        <span className={`text-[11px] font-medium ${timerClass}`}>
          Cocinando · <span className="font-mono font-bold">{left}m</span> restantes
          {order.extensionUsed && (
            <span className="ml-1 text-amber-700">+{order.extensionMin}m</span>
          )}
        </span>
      </div>
    )
  }

  // p1 ya no es un estado de tránsito normal: si el pedido está aquí es que la
  // comida está lista y nadie la ha tomado. El copy avisa desde el primer minuto.
  if (s === 'buffer_p1')
    return (
      <div className="flex items-center gap-[5px]">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-yellow-500" />
        <span className="text-[11px] font-semibold text-amber-700">
          Comida lista · nadie la ha tomado ·{' '}
          <span className="font-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'buffer_p2')
    return (
      <div className="flex items-center gap-[5px]">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand" />
        <span className="text-[11px] font-semibold text-brand-dark">
          Sin motorizado · <span className="font-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'buffer_p3')
    return (
      <div className="flex items-center gap-[5px]">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-danger" />
        <span className="text-[11px] font-bold text-danger">
          Sin motorizado hace <span className="font-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'heading')
    return (
      <div className="flex flex-wrap items-center gap-[5px]">
        <Icon name="two_wheeler" size={13} weight={500} className="shrink-0 text-violet-700" />
        <span className="text-[11px] font-medium text-violet-700">
          {d?.name ?? 'Motorizado'} viene a recoger
        </span>
        {/* El motorizado toma el pedido con ~10 min de cocción restantes, así que
            aquí la comida casi siempre sigue en la cocina. Sin este contador la
            cajera se quedaba ciega justo cuando más lo necesita. */}
        <CookingCountdown order={order} />
      </div>
    )

  if (s === 'waiting')
    return (
      <div>
        <div className="flex flex-wrap items-center gap-[5px]">
          <Icon
            name="check_circle"
            size={13}
            weight={500}
            filled
            className="shrink-0 text-success"
          />
          <span className="text-[12px] font-bold text-green-700">
            {d?.name ?? 'Motorizado'} llegó · Entregar pedido
          </span>
          {/* Puede haber llegado antes de que la comida salga de cocina. */}
          <CookingCountdown order={order} />
        </div>
        {order.cashChange != null && order.cashChange > 0 && (
          <div className="ml-[18px] mt-[3px] text-[11px] font-semibold text-green-700">
            Vuelto a preparar: <span className="font-mono">{soles(order.cashChange)}</span>
          </div>
        )}
      </div>
    )

  return null
}

function clickProps(order: OrderVM, onOpen?: (o: OrderVM) => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onOpen?.(order),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen?.(order)
      }
    },
  }
}

function IdAddress({ order }: { order: OrderVM }) {
  if (!order.addressRef) return null
  return (
    <div className="flex items-start gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink-muted">
      <Icon name="location_on" size={11} weight={500} className="mt-px shrink-0" />
      <span className="overflow-hidden text-ellipsis">{order.addressRef}</span>
    </div>
  )
}

/**
 * Escalamiento a Tindivo desde la propia tarjeta del tablero.
 *
 * `buffer_p2`/`p3` significan que la comida está lista y nadie la ha tomado —
 * el único camino de escalamiento que existe. El botón vivía solo dentro del
 * detalle: la cajera veía el rojo en la tarjeta y tenía que abrir el pedido
 * para encontrarlo. Ahora está a un toque, donde salta la alarma.
 *
 * Sin número usable se enseña el estado alternativo de prod: el aviso se ve,
 * pero no hay enlace que lleve a ninguna parte.
 */
function UrgentDriverButton({
  order,
  supportPhone,
  onCallDriver,
}: {
  order: OrderVM
  supportPhone?: string | null
  onCallDriver?: (o: OrderVM) => void
}) {
  if (order.state !== 'buffer_p2' && order.state !== 'buffer_p3') return null

  const alarma = order.state === 'buffer_p3'
  // Se revalida aquí aunque la página ya lo haga. Un comentario que dice "esto
  // llega validado" no impide que mañana alguien pase el valor crudo: medido
  // renderizando con '123', el botón salía anunciando "Pedir motorizado YA · 123".
  const phone = normalizeSupportPhone(supportPhone)

  // El estado alternativo va ANTES de la guarda del handler: sin número, la
  // página deja `onCallDriver` en `undefined`, y salir por ahí se tragaría el
  // aviso. La cajera tiene que ver que el escalamiento no está disponible.
  if (!phone || !onCallDriver) {
    return (
      <div className="mt-1.5 flex items-center gap-[5px] rounded-lg border border-dashed border-border px-2 py-1.5 text-[11px] font-semibold text-ink-muted">
        <Icon name="phone_disabled" size={13} weight={500} />
        Sin número de soporte configurado
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // La tarjeta entera abre el detalle: sin esto, escalar también lo abriría.
        e.stopPropagation()
        onCallDriver(order)
      }}
      className={`mt-1.5 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
        alarma
          ? 'animate-pulse bg-danger text-white'
          : 'border border-orange-300 bg-white text-brand-dark'
      }`}
    >
      <Icon name="call" size={14} weight={500} filled={alarma} />
      {alarma ? 'Pedir motorizado YA' : 'Pedir motorizado'} · {formatSupportPhone(phone)}
    </button>
  )
}

// ── Card: En cocina ───────────────────────────────────────────────────────────
export function CocinaCard({
  order,
  onOpen,
  compact = false,
  supportPhone,
  onCallDriver,
}: CocinaCardProps) {
  return (
    <div
      {...clickProps(order, onOpen)}
      className={cn(
        'cursor-pointer rounded-xl shadow-none transition-shadow duration-150 hover:shadow-elev-2',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        COOKING_STATE_CARD[order.state] ?? COOKING_STATE_CARD_FALLBACK,
      )}
    >
      <div className="mb-1 flex items-center gap-[5px]">
        <span className="font-mono text-[10px] font-bold text-ink-muted">#{order.id}</span>
        <SourceBadgeMini source={order.source} />
        <div className="flex-1" />
        <span className={cn('font-mono font-bold', compact ? 'text-[13px]' : 'text-[14px]')}>
          {soles(order.total)}
        </span>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn('flex-1 truncate font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {order.addressRef && (
        <div className="mb-1.5">
          <IdAddress order={order} />
        </div>
      )}

      <CookingStatusLine order={order} />

      <UrgentDriverButton order={order} supportPhone={supportPhone} onCallDriver={onCallDriver} />
    </div>
  )
}

// ── Card: Nuevo (pending_acceptance / validando) ──────────────────────────────
export function NuevoCard({ order, onOpen, compact = false }: CardProps) {
  const isUrgent = order.countdownSec < 60
  const urgencyClass = isUrgent ? 'text-danger' : 'text-brand'

  return (
    <div
      {...clickProps(order, onOpen)}
      className={cn(
        'cursor-pointer rounded-xl border bg-white shadow-none transition-shadow duration-150 hover:shadow-elev-2',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        isUrgent ? 'border-[#FCA5A5]' : 'border-[#FDBA74]',
      )}
    >
      <div className="mb-1 flex items-center gap-[5px]">
        <span className="font-mono text-[10px] font-bold text-ink-muted">#{order.id}</span>
        <div className="flex items-center gap-[3px]">
          <Icon name="timer" size={11} weight={500} className={`shrink-0 ${urgencyClass}`} />
          <span className={`font-mono text-[11px] font-bold ${urgencyClass}`}>
            {mmss(order.countdownSec)}
          </span>
        </div>
        <div className="flex-1" />
        {order.status === 'awaiting_payment' && (
          <span className="rounded-md border border-orange-100 bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-dark">
            Esperando pago
          </span>
        )}
        {order.status === 'validando' && (
          <span className="rounded-md border border-blue-100 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
            Validando
          </span>
        )}
        <SourceBadgeMini source={order.source} />
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn('flex-1 truncate font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <div className="flex shrink-0 items-center gap-[5px]">
          <PayBadgeMini payment={order.payment} />
          <span className={cn('font-mono font-bold', compact ? 'text-[13px]' : 'text-[14px]')}>
            {soles(order.total)}
          </span>
        </div>
      </div>

      <IdAddress order={order} />
      <RiskBadge order={order} />
    </div>
  )
}

// ── Card: En reparto ──────────────────────────────────────────────────────────
export function RepartoCard({ order, onOpen, compact = false }: CardProps) {
  const mAgo = order.pickupMinAgo ?? 0
  const isMed = mAgo >= 30 && mAgo < 45
  const isHigh = mAgo >= 45
  const borderClass = isHigh ? 'border-[#FDBA74]' : isMed ? 'border-[#FDE68A]' : 'border-border'

  const driverName = order.driver?.name ?? 'Motorizado'
  const statusDotClass = isHigh ? 'bg-brand' : isMed ? 'bg-yellow-500' : null
  const statusClass = isHigh ? 'text-brand-dark' : isMed ? 'text-amber-700' : 'text-violet-700'
  const statusText = isHigh
    ? `Reparto demorado · hace ${mAgo}m`
    : isMed
      ? `En camino mucho tiempo · hace ${mAgo}m`
      : `${driverName} entregando · hace ${mAgo}m`

  return (
    <div
      {...clickProps(order, onOpen)}
      className={cn(
        'cursor-pointer rounded-xl border bg-white shadow-none transition-shadow duration-150 hover:shadow-elev-2',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        borderClass,
      )}
    >
      <div className="mb-1 flex items-center gap-[5px]">
        <span className="font-mono text-[10px] font-bold text-ink-muted">#{order.id}</span>
        <SourceBadgeMini source={order.source} />
        <div className="flex-1" />
        <span className={cn('font-mono font-bold', compact ? 'text-[13px]' : 'text-[14px]')}>
          {soles(order.total)}
        </span>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn('flex-1 truncate font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {order.addressRef && (
        <div className="mb-1.5 truncate text-[11px] text-ink-muted">{order.addressRef}</div>
      )}

      <div className="flex items-center gap-[5px]">
        {statusDotClass ? (
          <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', statusDotClass)} />
        ) : (
          <Icon
            name="delivery_dining"
            size={13}
            weight={500}
            className={`shrink-0 ${statusClass}`}
          />
        )}
        <span
          className={`text-[11px] ${isMed || isHigh ? 'font-semibold' : 'font-medium'} ${statusClass}`}
        >
          {statusText}
        </span>
      </div>
    </div>
  )
}
