'use client'

import { Badge, Card, cn, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { useQueueLeadMinutes } from '@/hooks/use-queue-lead'
import { getTransferRemaining } from '@/hooks/use-team'
import { hourOf, mmss, soles } from '@/lib/format'
import { changeDue } from '@/lib/payment'
import type { CardOrder, TeamResponse } from '@/lib/types'
import { remainingParts } from '@/lib/urgency'

type IncomingRequest = TeamResponse['receivedRequests'][number]

function IncomingRequestStrip({ request, now }: { request: IncomingRequest; now: number }) {
  const { remainingSec, expired } = getTransferRemaining(request, now)

  if (expired) {
    return (
      <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11.5px] font-bold text-amber-900">
        <Icon name="sync" size={14} filled />
        Traspaso en curso a {request.requesterName}
      </p>
    )
  }

  return (
    <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-bold text-danger animate-pulse">
      <Icon name="swap_horiz" size={14} filled />
      {request.requesterName} te lo está pidiendo
      <span className="ml-auto font-mono tabular-nums">{mmss(remainingSec)}</span>
    </p>
  )
}

const ACTION_VERB: Record<string, string> = {
  heading_to_restaurant: 'Ir al local',
  waiting_at_restaurant: 'Recoger pedido',
  picked_up: 'Entregar pedido',
  waiting_driver: 'Tomar pedido',
  delivered: 'Pedido entregado',
}

type Pill = { label: string; icon: string; tone: 'default' | 'brand' | 'success' | 'warning' }

const STATE_PILL: Record<string, Pill> = {
  heading_to_restaurant: { label: 'En camino al local', icon: 'directions_bike', tone: 'warning' },
  waiting_at_restaurant: { label: 'Esperando pedido', icon: 'hourglass_top', tone: 'warning' },
  picked_up: { label: 'En entrega', icon: 'delivery_dining', tone: 'brand' },
  delivered: { label: 'Entregado', icon: 'check_circle', tone: 'success' },
}

function statePillFor(order: CardOrder, variant: string): Pill | null {
  if (variant === 'delivered') return STATE_PILL.delivered ?? null
  return STATE_PILL[order.status] ?? null
}

function CookingChip({
  readyAt,
  now,
  readyEarly = false,
}: {
  readyAt: string
  now: number
  readyEarly?: boolean
}) {
  const queueLeadMin = useQueueLeadMinutes()
  const remainingMs = Date.parse(readyAt) - now
  const remainingSec = remainingMs / 1000
  const { value, late } = remainingParts(remainingMs)

  if (late) {
    if (readyEarly) {
      const elapsedSec = Math.abs(remainingMs) / 1000
      const isAmber = elapsedSec <= queueLeadMin * 60
      const timeStr = mmss(elapsedSec)
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums border',
            isAmber
              ? 'bg-amber-50 text-amber-900 border-amber-300/60'
              : 'bg-danger-soft text-danger border-danger/20',
          )}
        >
          <Icon name={isAmber ? 'schedule' : 'priority_high'} size={13} />
          Te espera hace {timeStr}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-danger border border-danger/20">
        <Icon name="priority_high" size={13} />
        Esperando {mmss(Math.abs(remainingSec))}
      </span>
    )
  }

  // Countdown en curso normal: Terciario sin color semántico
  return (
    <span className="inline-flex items-center gap-1 text-meta text-ink-subtle font-mono">
      <Icon name="schedule" size={13} className="text-ink-subtle" />
      Listo en {value}
    </span>
  )
}

export function OrderCard({
  order,
  now,
  variant = 'available',
  blocked = false,
  blockedReason,
  incomingRequest = null,
  ownerName,
}: {
  order: CardOrder
  now: number
  variant?: 'available' | 'mine' | 'delivered' | 'team'
  ownerName?: string
  incomingRequest?: IncomingRequest | null
  blocked?: boolean
  blockedReason?: string
}) {
  const router = useRouter()
  const queueLeadMin = useQueueLeadMinutes()
  const total = order.order_amount + order.delivery_fee
  const isTeam = variant === 'team'
  const inert = blocked || isTeam
  const muted = blocked
  const accent = `#${order.business?.accent_color ?? 'f97316'}`
  const statePill = statePillFor(order, variant)

  const vuelto = changeDue({
    paymentIntent: order.payment_intent,
    total,
    cashAmount: null,
    clientPaysWith: order.client_pays_with,
    changeToGive: order.change_to_give,
  })

  const readyAt = order.estimated_ready_at
  const showCountdown = readyAt != null && variant !== 'delivered' && order.status !== 'picked_up'

  // Determinación de Urgencia y Colores de Borde (A.4)
  const remainingMs = readyAt ? Date.parse(readyAt) - now : 0
  const isLate = readyAt ? remainingMs < 0 : false
  const elapsedSec = isLate ? Math.abs(remainingMs) / 1000 : 0
  const isOverdue = isLate && order.ready_early_used && elapsedSec > queueLeadMin * 60

  let borderStyle = 'border-ink/10 bg-card'
  if (isOverdue) {
    borderStyle = 'border-danger/40 bg-danger-soft/10 shadow-sm'
  } else if (isLate && order.ready_early_used) {
    borderStyle = 'border-warning/50 bg-amber-50/20'
  } else if (order.ready_early_used) {
    borderStyle = 'border-success/40 bg-success/[0.02]'
  }

  // Acción verbal personalizada
  let actionText = ACTION_VERB[order.status] ?? 'Ver pedido'
  if (order.status === 'picked_up' && (isTeam ? ownerName : order.customer_name)) {
    actionText = `Entregar a ${isTeam ? ownerName : order.customer_name}`
  }

  return (
    <Card
      as={inert ? 'div' : 'button'}
      {...(inert ? { 'aria-disabled': true } : { type: 'button' as const })}
      onClick={inert ? undefined : () => router.push(`/pedido/${order.id}`)}
      className={cn(
        'relative block w-full overflow-hidden p-3.5 text-left transition-all duration-300 border rounded-2xl',
        borderStyle,
        muted && 'opacity-70',
        inert
          ? 'cursor-default'
          : 'hover:-translate-y-0.5 hover:shadow-elev-2 active:translate-y-0 active:scale-[0.99]',
      )}
    >
      {/* Franja de acento de marca del local */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl"
        style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}40` }}
      />

      {/* Traspaso entrante (Modal o Strip Flotante Superior) */}
      {variant === 'mine' && incomingRequest && (
        <IncomingRequestStrip request={incomingRequest} now={now} />
      )}

      {/* ── BANDA 1 · ORIENTACIÓN (peso medio) ── */}
      <div className="mb-2.5 pl-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-medium text-caption text-ink-muted">
              {order.business?.name ?? 'Restaurante'}
            </span>
            <span className="font-mono text-micro text-ink-subtle shrink-0">#{order.short_id}</span>
            {order.source === 'customer_pwa' && <SourceChip source={order.source} />}
          </div>

          {isTeam && statePill && (
            <Badge variant={statePill.tone} size="sm" className="shrink-0 gap-1 text-[10.5px]">
              <Icon name={statePill.icon} size={12} filled />
              {statePill.label}
            </Badge>
          )}
        </div>

        {(order.delivery_reference ?? order.delivery_address) && (
          <p className="mt-1 flex items-start gap-1 text-body font-medium leading-snug text-ink">
            <Icon name="location_on" size={16} className="mt-0.5 shrink-0 text-brand" />
            <span className="line-clamp-2">
              {order.delivery_reference ?? order.delivery_address}
            </span>
          </p>
        )}

        <p className="mt-0.5 text-caption text-ink-muted pl-5">
          Cliente:{' '}
          <span className="font-medium text-ink-muted">
            {isTeam ? (ownerName ?? 'Compañero') : (order.customer_name ?? 'Cliente')}
          </span>
        </p>
      </div>

      {/* ── BANDA 2 · ACCIÓN (peso máximo) — M1: La acción en su propia línea ── */}
      <div className="mb-3 pl-1">
        {/* Fila A: Acción Verbal sola en su propia línea */}
        <div className="block font-semibold text-lead text-ink tracking-tight">{actionText}</div>

        {/* Fila B: Badges y timers en la siguiente línea (Comida lista solo cuando va al local) */}
        {((order.ready_early_used && order.status === 'heading_to_restaurant') ||
          showCountdown) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {order.ready_early_used && order.status === 'heading_to_restaurant' && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                <Icon name="check_circle" size={13} filled />
                Comida lista
              </span>
            )}
            {showCountdown && (
              <CookingChip
                readyAt={readyAt}
                now={now}
                readyEarly={Boolean(order.ready_early_used)}
              />
            )}
          </div>
        )}
      </div>

      {/* ── BANDA 3 · DINERO (peso protegido) — M2: Jerarquía dentro de cobro ── */}
      {blocked && blockedReason ? (
        <div className="rounded-xl bg-ink/[0.04] p-2.5 border border-ink/[0.06] text-caption font-medium text-ink-muted flex items-center gap-1.5">
          <Icon name="lock" size={14} className="shrink-0 text-ink-muted" />
          <span>Acción suspendida: {blockedReason}</span>
        </div>
      ) : (
        <div className="rounded-xl bg-ink/[0.03] p-2.5 border border-ink/[0.05]">
          {isTeam ? (
            <div>
              <span className="block font-mono text-[20px] font-bold text-ink leading-tight">
                {soles(total)}
              </span>
              <span className="block text-caption font-semibold text-ink-muted mt-0.5">
                Importe del pedido
              </span>
            </div>
          ) : order.payment_intent === 'prepaid' ? (
            <div>
              {/* "No cobrar" ocupa el lugar de la cifra grande */}
              <span className="block font-sans text-[20px] font-bold text-success leading-tight">
                No cobrar
              </span>
              <span className="block text-caption font-semibold text-success/90 mt-0.5">
                Prepagado en la app
              </span>
              <span className="block text-meta text-ink-subtle mt-0.5">
                Ya pagado por el cliente
              </span>
            </div>
          ) : (
            <div>
              {/* Cifra grande en mono peso 700 */}
              <span className="block font-mono text-[20px] font-bold text-ink leading-tight">
                {soles(total)}
              </span>

              {/* Cualificador en caption */}
              <span className="block text-caption font-semibold text-ink-muted mt-0.5">
                {order.payment_intent === 'pending_yape' ||
                (order.payment_intent as string) === 'pending_wallet'
                  ? 'Cobrar por Yape / Plin'
                  : order.payment_intent === 'pending_mixed'
                    ? 'Pago mixto (Yape + Efectivo)'
                    : 'Cobrar en efectivo'}
              </span>

              {/* Instrucción en meta */}
              <span className="block text-meta text-ink-subtle mt-0.5">
                {order.payment_intent === 'pending_yape' ||
                (order.payment_intent as string) === 'pending_wallet'
                  ? 'Muestra el QR al cliente'
                  : order.payment_intent === 'pending_mixed'
                    ? 'Verifica saldo Yape + efectivo'
                    : vuelto != null && vuelto > 0
                      ? `Paga con ${soles(order.client_pays_with ?? 0)} · devuelves ${soles(vuelto)}`
                      : 'Sin vuelto'}
              </span>
            </div>
          )}
        </div>
      )}

      {variant === 'delivered' && order.delivered_at && (
        <p className="mt-2 font-mono text-micro text-ink-subtle">{hourOf(order.delivered_at)}</p>
      )}
    </Card>
  )
}
