'use client'

import { Card, cn, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { useQueueLeadMinutes } from '@/hooks/use-queue-lead'
import { getTransferRemaining } from '@/hooks/use-team'
import { mmss } from '@/lib/format'
import { buildCardVM, type CardVariant, type Tone } from '@/lib/orders/card-view-model'
import type { CardOrder, TeamResponse } from '@/lib/types'

type IncomingRequest = TeamResponse['receivedRequests'][number]

/**
 * Tarjeta del board en CUATRO FILAS, de arriba abajo por orden de lectura real:
 *
 *   1. Cejilla   — local · código, en gris pequeño. Contexto, no decisión.
 *   2. Identidad — el nombre, en grande, con UNA ranura a su altura.
 *   3. Referencia— dónde va. En un pueblo sin numeración, esto ES la dirección.
 *   4. Cobro     — una línea, método al frente.
 *
 * Míos intercala el verbo de la acción entre la 3 y la 4; es la única bandeja
 * donde "qué toca ahora" no es evidente por el contexto de la pestaña.
 *
 * POR QUÉ ASÍ. La versión anterior medía ~250px y solo entraban dos tarjetas en
 * un móvil de 360×780 (el lienzo real son ~440px: el resto se lo llevan la
 * barra superior, el saludo, las pestañas pegajosas y la nav inferior). Esta
 * mide ~112px, o ~132 en Míos. La altura no se recortó apretando la letra —eso
 * habría empeorado lo que ya se leía mal— sino borrando filas: tres elementos
 * que decían lo mismo colapsaron en la ranura, la banda de cobro pasó de cuatro
 * líneas con fondo propio a una, y el nombre del local dejó su sitio al del
 * cliente, que es por quien el motorizado identifica el pedido.
 *
 * Las decisiones de QUÉ se dice viven en `lib/orders/card-view-model`, con
 * tests. Aquí solo se pinta.
 */

/**
 * La urgencia mueve el HAIRLINE, nunca el relleno.
 *
 * Doctrina original de `urgency.ts`, restaurada: el rediseño anterior había
 * metido fondos semánticos que aplanaban el contraste de todo lo que hay dentro
 * justo en la tarjeta que más urge leer — y uno de ellos era del 2% de
 * opacidad, invisible en un móvil al sol.
 */
const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-ink/10',
  success: 'border-success/45',
  warning: 'border-warning/60',
  danger: 'border-danger/45',
}

/** Neutro sin caja: solo la verdad urgente merece fondo y grita. */
const SLOT_CHIP: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  success: 'rounded-full bg-success-soft px-2 py-0.5 text-success',
  warning: 'rounded-full bg-warning-soft px-2 py-0.5 text-amber-900',
  danger: 'rounded-full bg-danger-soft px-2 py-0.5 text-danger',
}

function IncomingRequestStrip({ request, now }: { request: IncomingRequest; now: number }) {
  const { remainingSec, expired } = getTransferRemaining(request, now)

  if (expired) {
    return (
      <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-meta font-bold text-amber-900">
        <Icon name="sync" size={14} filled />
        Traspaso en curso a {request.requesterName}
      </p>
    )
  }

  return (
    <p className="mb-2 flex animate-pulse items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-meta font-bold text-danger">
      <Icon name="swap_horiz" size={14} filled />
      {request.requesterName} te lo está pidiendo
      <span className="ml-auto font-mono tabular-nums">{mmss(remainingSec)}</span>
    </p>
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
  variant?: CardVariant
  ownerName?: string
  incomingRequest?: IncomingRequest | null
  blocked?: boolean
  blockedReason?: string
}) {
  const router = useRouter()
  const queueLeadMinutes = useQueueLeadMinutes()
  const vm = buildCardVM({
    order,
    now,
    variant,
    queueLeadMinutes,
    ownerName,
    blocked,
    blockedReason,
  })
  const accent = `#${order.business?.accent_color ?? 'f97316'}`

  return (
    <Card
      as="div"
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border bg-card px-3 py-2.5 pl-4 text-left transition-shadow duration-200',
        TONE_BORDER[vm.tone],
        vm.muted && 'opacity-70',
        // `Card` mete `hover:shadow-elev-2` en su base incondicionalmente, así
        // que las tarjetas que NO se pueden pulsar —Equipo, y las bloqueadas de
        // "En espera"— se levantaban al pasar el cursor fingiendo ser
        // clicables. `twMerge` deja ganar a la última del mismo grupo.
        !vm.interactive && 'hover:shadow-elev-1',
      )}
    >
      {/* Franja de acento del local. Sin glow: `overflow-hidden` lo recortaba
          entero, así que era una sombra pagada y nunca vista. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accent }}
      />

      {/*
        UN SOLO OBJETIVO TÁCTIL, y encima de todo.

        Antes la tarjeta ENTERA era un `<button>` con `<p>` y `<div>` dentro:
        HTML inválido, y un lector de pantalla anunciaba las ~40 palabras del
        contenido como una sola etiqueta. Ahora el contenedor es un `div`
        normal y la interacción la lleva este botón transparente estirado, con
        una etiqueta corta que dice de qué pedido se trata.
      */}
      {vm.interactive && (
        <button
          type="button"
          onClick={() => router.push(`/pedido/${order.id}`)}
          aria-label={`Ver pedido de ${vm.identity} · ${vm.businessName}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99]"
        />
      )}

      {variant === 'mine' && incomingRequest && (
        <IncomingRequestStrip request={incomingRequest} now={now} />
      )}

      {/* ── 1 · Cejilla ── */}
      <div className="flex items-center gap-1.5 text-meta text-ink-muted">
        <span className="truncate">{vm.businessName}</span>
        {vm.shortId && <span className="shrink-0 font-mono">#{vm.shortId}</span>}
        {vm.slotsNote && (
          <span className="shrink-0 rounded-full bg-warning-soft px-1.5 font-semibold text-amber-900">
            {vm.slotsNote}
          </span>
        )}
        {vm.showSourceChip && <SourceChip source={order.source} />}
      </div>

      {/* ── 2 · Identidad + ranura ── */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {vm.identityIcon && (
            <Icon name={vm.identityIcon} size={17} className="shrink-0 text-ink-muted" />
          )}
          <span className="truncate font-semibold text-lead text-ink tracking-tight">
            {vm.identity}
          </span>
        </span>

        {vm.slot && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 font-mono text-meta font-semibold tabular-nums',
              SLOT_CHIP[vm.slot.tone],
            )}
          >
            <Icon name={vm.slot.icon} size={13} filled={vm.slot.tone !== 'neutral'} />
            {vm.slot.text}
          </span>
        )}
      </div>

      {/* ── 3 · Referencia ──
          `line-clamp-2` y no altura fija: una referencia rural truncada es una
          entrega equivocada, así que las tarjetas con dirección larga miden más
          y está bien que así sea. */}
      {vm.reference && (
        <p className="mt-1 flex items-start gap-1 text-body font-medium leading-snug text-ink">
          <Icon name="location_on" size={16} className="mt-px shrink-0 text-brand" />
          <span className="line-clamp-2">{vm.reference}</span>
        </p>
      )}

      {/* ── 4 · Verbo (solo Míos) ── */}
      {vm.action && (
        <p className="mt-1.5 font-semibold text-body-lg text-ink tracking-tight">{vm.action}</p>
      )}

      {/* ── 5 · Cobro, o el motivo del bloqueo en su lugar ── */}
      {vm.blockedReason ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-caption font-medium text-ink-muted">
          <Icon name="lock" size={14} className="shrink-0" />
          {vm.blockedReason}
        </p>
      ) : (
        vm.money && (
          <p
            className={cn(
              'mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5',
              vm.money.tone === 'success' ? 'text-success' : 'text-ink',
            )}
          >
            <Icon
              name={vm.money.icon}
              size={15}
              filled
              className="self-center shrink-0"
              aria-hidden
            />
            {vm.money.amount && (
              <span className="font-mono text-body-lg font-bold tabular-nums">
                {vm.money.amount}
              </span>
            )}
            {/* `ink-muted` y NO `ink-subtle`: aquí vive el vuelto, y
                `--color-ink-subtle` da 2,5:1 sobre blanco — por debajo del
                mínimo legible, en la calle y con casco. */}
            <span
              className={cn(
                'text-caption font-medium',
                vm.money.tone === 'success' ? 'text-success' : 'text-ink-muted',
              )}
            >
              {vm.money.label}
            </span>
            {vm.money.change && (
              <span className="text-caption font-semibold text-ink-muted">· {vm.money.change}</span>
            )}
          </p>
        )
      )}
    </Card>
  )
}
