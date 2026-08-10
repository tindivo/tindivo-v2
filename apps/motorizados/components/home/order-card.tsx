'use client'

import { Badge, Card, cn, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { getTransferRemaining } from '@/hooks/use-team'
import { hourOf, mmss, soles } from '@/lib/format'
import { changeDue } from '@/lib/payment'
import type { CardOrder, TeamResponse } from '@/lib/types'
import { orderUrgency, remainingParts, URGENCY_CARD } from '@/lib/urgency'

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

/**
 * Desde que el pedido está en la mochila, "Comida lista" deja de informar: el
 * motorizado la lleva encima. El aviso solo vale ANTES de recoger, que es
 * cuando decide si sale ya o espera.
 */
const PICKED_UP_OR_LATER = new Set(['picked_up', 'delivered'])

type Pill = { label: string; icon: string; tone: 'default' | 'brand' | 'success' | 'warning' }

/**
 * Estado del RECORRIDO del motorizado. Vocabulario y iconos portados del v1
 * (`packages/ui/src/patterns/status-chip.tsx`), que ya los tenía resueltos.
 *
 * Las etiquetas van en tercera persona a propósito. Las primeras que escribí
 * eran en primera ("Voy al local") y se leían bien en "Míos", pero ESTA MISMA
 * tarjeta se usa en "Equipo", donde el pedido es de otro motorizado: ahí "Voy
 * al local" es sencillamente falso. Neutras funcionan en las tres bandejas.
 */
const STATE_PILL: Record<string, Pill> = {
  heading_to_restaurant: {
    label: 'En camino al local',
    icon: 'directions_bike',
    tone: 'warning',
  },
  waiting_at_restaurant: { label: 'Esperando pedido', icon: 'hourglass_top', tone: 'warning' },
  picked_up: { label: 'En entrega', icon: 'delivery_dining', tone: 'brand' },
  delivered: { label: 'Entregado', icon: 'check_circle', tone: 'success' },
}

/**
 * Píldora de estado de la esquina superior derecha.
 *
 * Antes el estado solo existía en "Míos", como tres barritas al FINAL de la
 * tarjeta con una etiqueta de 11px; en las otras dos bandejas no se veía en
 * ningún lado. Ahora sale arriba y en las tres.
 *
 * OJO con lo que NO está aquí: "Comida lista". Es el estado de la COMIDA, no
 * del motorizado, y son ortogonales — "Esperando pedido" con la comida lista
 * significa agarrar y salir; sin ella, sentarse a esperar. Al meterlos en el
 * mismo hueco, tomar el pedido borraba el aviso de que la comida ya estaba
 * fuera. Vive abajo, en el sitio del reloj, que es donde se pregunta "¿cuándo?".
 *
 * En "En espera" no hay píldora a propósito: ahí TODOS los pedidos esperan
 * motorizado, así que decirlo en cada tarjeta es una constante, y una constante
 * no informa.
 *
 * Tampoco hay caso para `upcoming`: los pedidos en cocina se pintan en
 * `UpcomingOrdersSection`, con su propio componente. Nadie pasa ya esa variante
 * a esta tarjeta (ver la nota en el prop `variant`).
 */
function statePillFor(order: CardOrder, variant: string): Pill | null {
  // `?? null` y no `!`: con `noUncheckedIndexedAccess` indexar un Record por
  // string devuelve `T | undefined`, y este mapa se lee con `order.status`, que
  // es un string libre — mañana puede llegar un estado que no esté aquí.
  if (variant === 'delivered') return STATE_PILL.delivered ?? null
  return STATE_PILL[order.status] ?? null
}

/**
 * Cuenta atrás viva hasta que la comida esté lista.
 *
 * Es LA señal de urgencia de la tarjeta desde que el fondo dejó de teñirse: si
 * el pedido ya se pasó, esta píldora se pone roja y el pulse hace el resto.
 * La precisión la decide `remainingParts`, compartida con el detalle.
 */
function CookingChip({ readyAt, now }: { readyAt: string; now: number }) {
  const { value, late } = remainingParts(Date.parse(readyAt) - now)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${
        late ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-amber-900'
      }`}
    >
      <Icon name={late ? 'priority_high' : 'schedule'} size={13} />
      {late ? `Esperando ${value}` : `Listo en ${value}`}
    </span>
  )
}

/** Card compacta del board: toda clickeable, navega al detalle del pedido. */
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
  /**
   * `upcoming` ya NO existe: los pedidos en cocina se pintan en
   * `UpcomingOrdersSection`, con su propio componente. La variante seguía
   * declarada aquí con su rama de render —franja gris, pie "No aceptable aún"—
   * que nadie alcanzaba desde que esa sección se separó.
   */
  variant?: 'available' | 'mine' | 'delivered' | 'team'
  /**
   * Compañero que tiene el pedido. Solo en `team`: ahí el nombre grande es el
   * del motorizado —a quien le pedirías el traspaso— y NO el del cliente, que
   * es dato de un tercero y no viaja en el payload.
   */
  ownerName?: string
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
  // Un pedido del equipo es de OTRO motorizado: no se abre desde aquí. La
  // acción de esa pestaña es pedir el traspaso, y vive en su propio botón.
  const isTeam = variant === 'team'
  // Mismo camino para las dos razones de no-accionable: bloqueada o ajena.
  const inert = blocked || isTeam
  // …pero solo se ATENÚA lo que está frenado. Un pedido del equipo se lee
  // entero: no es que no puedas tomarlo, es que no se abre desde la tarjeta.
  const muted = blocked
  const accent = `#${order.business?.accent_color ?? 'f97316'}`
  const statePill = statePillFor(order, variant)
  // Derivado, no leído: `change_to_give` llega NULL en los manuales. Ver
  // `lib/payment.ts` — antes esta tarjeta nunca enseñaba el vuelto.
  const vuelto = changeDue({
    paymentIntent: order.payment_intent,
    total,
    cashAmount: null,
    clientPaysWith: order.client_pays_with,
    changeToGive: order.change_to_give,
  })
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
        muted && 'opacity-70',
        inert
          ? 'cursor-default'
          : 'hover:-translate-y-0.5 hover:shadow-elev-2 active:translate-y-0 active:scale-[0.99]',
        URGENCY_CARD[urgency],
        urgency === 'overdue' && 'tindivo-overdue-glow',
        variant === 'delivered' && 'opacity-85',
      )}
    >
      {/* Franja del restaurante: identifica el local antes de leer nada. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}40` }}
      />

      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/55">
            {order.business?.name ?? 'Restaurante'}
          </span>
          {/* En Equipo el nombre grande es el del COMPAÑERO que lo lleva: es a
              quien le pides el traspaso. El del cliente no viaja en ese payload
              a propósito — dato de un tercero que no decide nada aquí. */}
          <span className="mt-0.5 block truncate text-[17px] font-semibold leading-tight text-ink">
            {isTeam ? (ownerName ?? 'Compañero') : (order.customer_name ?? 'Cliente')}
          </span>

          {/* Línea meta: identificadores, en gris y pequeños.
              El código se necesita para nombrarle el pedido a la cajera, pero no
              decide nada — antes competía arriba a la derecha con el estado.
              El distintivo de origen SOLO aparece cuando el pedido viene de la
              app: hoy el 100% de los pedidos son manuales, así que ese chip era
              constante, y un distintivo que nunca cambia no informa. Una
              insignia marca la excepción, no la norma. */}
          <span className="mt-1 flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-subtle">#{order.short_id}</span>
            {order.source === 'customer_pwa' && <SourceChip source={order.source} />}
            {/* Cuántos huecos de mochila consume.
                SOLO desde `picked_up`: el dato lo declara el propio motorizado
                en el `PickupSheet` al recoger las bolsas, y `advance_order` lo
                escribe únicamente en la acción `pickup`. Antes de ese momento la
                columna vale su default de 1, así que pintarlo en "En espera"
                sería enseñar un número que nadie decidió todavía.
                Donde sí informa: en "Míos" explica por qué el contador dice 2/3
                con un solo pedido, y en "Equipo" dice cuánto te va a costar el
                traspaso antes de pedirlo. */}
            {order.status === 'picked_up' && order.occupancy_slots > 1 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-semibold text-[10.5px] text-ink-muted">
                <Icon name="shopping_basket" size={12} />
                Ocupa {order.occupancy_slots}
              </span>
            )}
          </span>
        </span>

        {/* Columna de ESTADO, y solo de estado. Es la zona que cambia, así que
            no se mezcla con identificadores que no cambian nunca. */}
        {statePill && (
          <Badge variant={statePill.tone} size="sm" className="shrink-0 gap-1">
            <Icon name={statePill.icon} size={14} filled />
            {statePill.label}
          </Badge>
        )}
      </div>

      {(order.delivery_reference ?? order.delivery_address) && (
        <p className="mt-1.5 flex items-start gap-1 text-[13px] leading-snug text-ink-muted">
          <Icon name="location_on" size={15} className="mt-px shrink-0 text-brand" />
          <span className="line-clamp-2">{order.delivery_reference ?? order.delivery_address}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-end justify-between gap-2">
        {/* En Equipo solo el importe. El método de cobro no viaja en ese payload
            —no es de los dos campos que se añadieron— y tampoco decide nada:
            cómo paga el cliente pasa a importarte cuando el pedido ya es tuyo. */}
        {isTeam ? (
          <span className="block font-display text-[20px] font-bold tracking-tight leading-none tabular-nums text-ink">
            {soles(total)}
          </span>
        ) : order.payment_intent === 'prepaid' ? (
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
                  {vuelto != null ? ` (Lleva ${soles(vuelto)} de vuelto)` : ''}
                </span>
              )}
            </span>
          </span>
        )}
        {/* El hueco del reloj responde "¿cuándo estará la comida?". Cuando la
            cajera ya la declaró lista, esa pregunta tiene respuesta definitiva
            y va aquí mismo — no arriba, donde competiría con el estado del
            recorrido y lo taparía. Antes este hueco se quedaba vacío en ese
            caso, que era perder la señal más accionable de la tarjeta. */}
        {order.ready_early_used && !PICKED_UP_OR_LATER.has(order.status) ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[11px] font-semibold text-success">
            <Icon name="check_circle" size={13} filled />
            Comida lista
          </span>
        ) : showCountdown ? (
          <CookingChip readyAt={readyAt} now={now} />
        ) : null}
      </div>

      {variant === 'mine' && incomingRequest && (
        <IncomingRequestStrip request={incomingRequest} now={now} />
      )}

      {/* La etiqueta del paso ya no va aquí: subió a la píldora de estado. Se
          queda solo la barra, que aporta lo que la píldora no puede — cuánto
          falta del recorrido, no en qué punto estás. */}
      {variant === 'mine' && step && (
        <div className="mt-3 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step.idx ? 'bg-brand' : 'bg-ink/10'}`}
            />
          ))}
        </div>
      )}

      {blocked && blockedReason && (
        <p className="mt-2.5 flex items-center gap-1.5 border-t border-ink/[0.06] pt-2 text-[11px] font-semibold text-ink-muted">
          <Icon name="lock" size={13} className="shrink-0" />
          {blockedReason}
        </p>
      )}

      {variant === 'delivered' && order.delivered_at && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">{hourOf(order.delivered_at)}</p>
      )}
    </Card>
  )
}
