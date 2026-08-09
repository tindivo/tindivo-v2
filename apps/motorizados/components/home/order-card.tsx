'use client'

import { Badge, Card, cn, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { getTransferRemaining } from '@/hooks/use-team'
import { hourOf, mmss, soles } from '@/lib/format'
import type { BoardOrder, TeamResponse } from '@/lib/types'
import { orderUrgency, URGENCY_CARD } from '@/lib/urgency'

type IncomingRequest = TeamResponse['receivedRequests'][number]

/**
 * Aviso de que un compañero te está pidiendo ESTE pedido.
 *
 * SOLO INFORMATIVO, a propósito: sin botones y sin abrir nada. Aceptar y
 * rechazar viven exclusivamente en el banner global (`TransferWatcher`), que se
 * ve desde cualquier pestaña. Dos superficies para la misma acción es una
 * invitación a que el motorizado toque la que no responde.
 *
 * El reloj sale de `getTransferRemaining`, el mismo helper que usa el banner, y
 * el `now` llega del ticker compartido: por eso los dos countdowns muestran el
 * mismo número en el mismo frame en vez de ir desfasados hasta un segundo.
 * NADA de `setInterval` aquí.
 */
function IncomingRequestStrip({ request, now }: { request: IncomingRequest; now: number }) {
  const { remainingSec, expired } = getTransferRemaining(request, now)

  if (expired) {
    return (
      <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11.5px] font-bold text-amber-900">
        <Icon name="sync" size={14} filled />
        Traspaso en curso a {request.requesterName}
      </p>
    )
  }

  return (
    <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-bold text-danger">
      <Icon name="swap_horiz" size={14} filled />
      {request.requesterName} te lo está pidiendo
      {/* Mismo formateador que el banner (ver nota allí). */}
      <span className="ml-auto font-mono tabular-nums">{mmss(remainingSec)}</span>
    </p>
  )
}

const MINE_STEPS: Record<string, { idx: number; label: string }> = {
  heading_to_restaurant: { idx: 0, label: 'Voy al local' },
  waiting_at_restaurant: { idx: 1, label: 'En el local' },
  picked_up: { idx: 2, label: 'En camino' },
}

/** Cuenta atrás viva hasta que la comida esté lista. */
function CookingChip({ readyAt, now }: { readyAt: string; now: number }) {
  const diff = Date.parse(readyAt) - now
  const late = diff < 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${
        late ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-amber-900'
      }`}
    >
      <Icon name={late ? 'priority_high' : 'schedule'} size={13} />
      {late ? `Esperando ${mmss(-diff / 1000)}` : `Listo en ${mmss(diff / 1000)}`}
    </span>
  )
}

/** Card compacta del board: toda clickeable, navega al detalle del pedido. */
export function OrderCard({
  order,
  now,
  variant = 'available',
  dimmed = false,
  blocked = false,
  blockedReason,
  incomingRequest = null,
}: {
  order: BoardOrder
  now: number
  variant?: 'available' | 'mine' | 'upcoming' | 'delivered'
  dimmed?: boolean
  /** Solicitud de traspaso entrante sobre ESTE pedido (solo en "Míos"). */
  incomingRequest?: IncomingRequest | null
  /**
   * El pedido existe y se ve, pero no se puede tomar todavía. La tarjeta deja
   * de navegar y de responder al toque.
   *
   * Atenuar SIN bloquear era lo que había antes (`dimmed` a secas) y no
   * comunicaba una regla: parecía un fallo de render, y la tarjeta seguía
   * navegando igual, así que la supuesta prioridad era decorativa.
   */
  blocked?: boolean
  /** Por qué está bloqueada. Se pinta en la tarjeta: bloquear sin decir por qué
   *  es indistinguible de una app rota. */
  blockedReason?: string
}) {
  const router = useRouter()
  const urgency = variant === 'available' ? orderUrgency(order, now) : 'normal'
  const total = order.order_amount + order.delivery_fee
  const step = MINE_STEPS[order.status]
  // Un pedido en cocción todavía no es accionable: la tarjeta no navega ni
  // responde al toque, como en producción. La señal de "aún no" tiene que ser
  // evidente antes de tocar, no después.
  const isUpcoming = variant === 'upcoming'
  // Mismo camino para las dos razones de no-accionable: en cocina o bloqueada.
  const inert = isUpcoming || blocked
  const accent = `#${order.business?.accent_color ?? 'f97316'}`
  const readyAt = order.estimated_ready_at
  const showCountdown =
    readyAt != null &&
    !order.ready_early_used &&
    variant !== 'delivered' &&
    order.status !== 'picked_up'

  return (
    <Card
      as={inert ? 'div' : 'button'}
      {...(inert ? { 'aria-disabled': true } : { type: 'button' as const })}
      onClick={inert ? undefined : () => router.push(`/pedido/${order.id}`)}
      className={cn(
        'relative block w-full overflow-hidden bg-gradient-to-br from-white to-surface py-3.5 pl-[18px] pr-4 text-left transition-all duration-300',
        inert
          ? 'cursor-default opacity-70'
          : 'hover:-translate-y-0.5 hover:shadow-elev-2 active:translate-y-0 active:scale-[0.99]',
        URGENCY_CARD[urgency],
        urgency === 'overdue' && 'tindivo-overdue-glow',
        dimmed && !inert && 'opacity-60',
        variant === 'delivered' && 'opacity-85',
      )}
    >
      {/* Franja del restaurante: identifica el local antes de leer nada. */}
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1.5', isUpcoming && 'bg-black/[0.12]')}
        style={
          isUpcoming ? undefined : { backgroundColor: accent, boxShadow: `0 0 8px ${accent}40` }
        }
      />

      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/55">
            {order.business?.name ?? 'Restaurante'}
          </span>
          <span className="mt-0.5 block truncate text-[17px] font-semibold leading-tight text-ink">
            {order.customer_name ?? 'Cliente'}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="flex items-center gap-1.5">
            <SourceChip source={order.source} />
            <span className="font-mono text-[11px] text-ink-subtle">#{order.short_id}</span>
          </span>
          {variant === 'available' && urgency === 'overdue' && (
            <Badge variant="danger" size="sm">
              Vencido
            </Badge>
          )}
          {/* La cajera confirmó que la comida ya salió de cocina. Pesa más que
              el resto de distintivos: es la diferencia entre ir y esperar. */}
          {variant !== 'delivered' && order.ready_early_used && (
            <Badge variant="success" size="sm">
              Comida lista
            </Badge>
          )}
          {variant === 'delivered' && (
            <Badge variant="success" size="sm">
              Entregado
            </Badge>
          )}
        </span>
      </div>

      {(order.delivery_reference ?? order.delivery_address) && (
        <p className="mt-1.5 flex items-start gap-1 text-[13px] leading-snug text-ink-muted">
          <Icon name="location_on" size={15} className="mt-px shrink-0 text-brand" />
          <span className="line-clamp-2">{order.delivery_reference ?? order.delivery_address}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-end justify-between gap-2">
        {order.payment_intent === 'prepaid' ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
            <Icon name="verified" size={16} filled />
            No cobrar (Prepagado)
          </span>
        ) : (
          <span>
            <span className="block font-display text-[20px] font-bold tracking-tight leading-none tabular-nums text-ink">
              {soles(total)}
            </span>
            <span className="mt-1.5 block">
              {order.payment_intent === 'pending_yape' ||
              (order.payment_intent as string) === 'pending_wallet' ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-purple-100 px-2 py-0.5 text-[11.5px] font-bold text-purple-800">
                  <Icon name="qr_code_2" size={14} filled />
                  Cobrar por Yape / Plin
                </span>
              ) : order.payment_intent === 'pending_mixed' ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-100 px-2 py-0.5 text-[11.5px] font-bold text-indigo-800">
                  <Icon name="shuffle" size={14} filled />
                  Pago mixto (Yape + Efectivo)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-0.5 text-[11.5px] font-bold text-emerald-800">
                  <Icon name="payments" size={14} filled />
                  Cobrar en efectivo
                  {order.change_to_give != null && order.change_to_give > 0
                    ? ` (Lleva ${soles(order.change_to_give)} de vuelto)`
                    : ''}
                </span>
              )}
            </span>
          </span>
        )}
        {showCountdown && <CookingChip readyAt={readyAt} now={now} />}
      </div>

      {variant === 'mine' && incomingRequest && (
        <IncomingRequestStrip request={incomingRequest} now={now} />
      )}

      {variant === 'mine' && step && (
        <div className="mt-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step.idx ? 'bg-brand' : 'bg-ink/10'}`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] font-medium text-ink-muted">{step.label}</p>
        </div>
      )}

      {blocked && blockedReason && (
        <p className="mt-2.5 flex items-center gap-1.5 border-t border-ink/[0.06] pt-2 text-[11px] font-semibold text-ink-muted">
          <Icon name="lock" size={13} className="shrink-0" />
          {blockedReason}
        </p>
      )}

      {isUpcoming && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink/[0.06] pt-2">
          <span className="text-[11px] font-medium text-ink-subtle">
            {readyAt
              ? `En cocina · listo en ~${Math.max(1, Math.round((Date.parse(readyAt) - now) / 60_000))} min`
              : 'En cocina'}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-ink-subtle">
            No aceptable aún
          </span>
        </div>
      )}

      {variant === 'delivered' && order.delivered_at && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">{hourOf(order.delivered_at)}</p>
      )}
    </Card>
  )
}
