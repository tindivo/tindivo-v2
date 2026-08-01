'use client'

import type { OrderVM } from '@/lib/orders/view-model'
import { formatSupportPhone, normalizeSupportPhone } from '@/lib/support'
import { MS, mmss, PayBadgeMini, SourceBadgeMini, soles } from './primitives'

type CardProps = { order: OrderVM; onOpen?: (o: OrderVM) => void; compact?: boolean }

type CocinaCardProps = CardProps & {
  /** El número de soporte tal cual sale de `app_settings`. La tarjeta lo valida
   *  por su cuenta: no se fía de que llegue ya normalizado. */
  supportPhone?: string | null
  onCallDriver?: (o: OrderVM) => void
}

const COOKING_STATE_STYLE: Record<string, { border: string; borderW: string; bg: string }> = {
  cooking: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
  buffer_p1: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
  buffer_p2: { border: '#FDBA74', borderW: '1px', bg: '#fff' },
  buffer_p3: { border: '#FCA5A5', borderW: '1px', bg: '#fff' },
  heading: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
  waiting: { border: '#4ADE80', borderW: '2px', bg: 'rgba(22,163,74,0.025)' },
}

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
    <div
      style={{
        marginTop: 7,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 999,
        background: '#FFF7ED',
        color: '#C2410C',
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <MS name="shield" size={13} filled />
      {RISK_REASON_LABEL[order.validationReasonCode ?? ''] ?? 'Validar antes de cocinar'}
    </div>
  )
}

/** Minutos que faltan para que la comida esté lista. Se muestra junto al
 *  motorizado cuando el pedido ya fue tomado pero la cocina sigue trabajando. */
function CookingCountdown({ minutesLeft }: { minutesLeft: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        color: '#C2410C',
        fontWeight: 600,
      }}
    >
      <MS name="timer" size={12} style={{ color: '#C2410C' }} />
      <span className="tv-mono" style={{ fontWeight: 700 }}>
        {minutesLeft}m
      </span>{' '}
      en cocina
    </span>
  )
}

// ── Status line dentro de "En cocina" ─────────────────────────────────────────
export function CookingStatusLine({ order }: { order: OrderVM }) {
  const s = order.state
  const d = order.driver

  if (s === 'cooking') {
    const left = order.minutesLeft ?? order.prepMinutes ?? 0
    const prep = order.prepMinutes ?? 0
    const pct = prep > 0 ? left / prep : 1
    const textColor = pct < 0.15 ? '#C2410C' : '#57534E'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <MS name="timer" size={12} style={{ color: textColor }} />
        <span style={{ fontSize: 11, color: textColor, fontWeight: 500 }}>
          Cocinando ·{' '}
          <span className="tv-mono" style={{ fontWeight: 700 }}>
            {left}m
          </span>{' '}
          restantes
          {order.extensionUsed && (
            <span style={{ color: '#B45309', marginLeft: 5 }}>+{order.extensionMin}m</span>
          )}
        </span>
      </div>
    )
  }

  // p1 ya no es un estado de tránsito normal: si el pedido está aquí es que la
  // comida está lista y nadie la ha tomado. El copy avisa desde el primer minuto.
  if (s === 'buffer_p1')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: 999, background: '#EAB308', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>
          Comida lista · nadie la ha tomado ·{' '}
          <span className="tv-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'buffer_p2')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: 999, background: '#F97316', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: '#C2410C', fontWeight: 600 }}>
          Sin motorizado · <span className="tv-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'buffer_p3')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: 999, background: '#EF4444', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>
          Sin motorizado hace <span className="tv-mono">{order.bufferMinutes}m</span>
        </span>
      </div>
    )

  if (s === 'heading')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <MS name="two_wheeler" size={13} style={{ color: '#6D28D9', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#6D28D9', fontWeight: 500 }}>
          {d?.name ?? 'Motorizado'} viene a recoger
        </span>
        {/* El motorizado toma el pedido con ~10 min de cocción restantes, así que
            aquí la comida casi siempre sigue en la cocina. Sin este contador la
            cajera se quedaba ciega justo cuando más lo necesita. */}
        {order.minutesLeft != null && <CookingCountdown minutesLeft={order.minutesLeft} />}
      </div>
    )

  if (s === 'waiting')
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <MS name="check_circle" size={13} filled style={{ color: '#16A34A', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#15803D', fontWeight: 700 }}>
            {d?.name ?? 'Motorizado'} llegó · Entregar pedido
          </span>
          {/* Puede haber llegado antes de que la comida salga de cocina. */}
          {order.minutesLeft != null && <CookingCountdown minutesLeft={order.minutesLeft} />}
        </div>
        {order.cashChange != null && order.cashChange > 0 && (
          <div
            style={{
              fontSize: 11,
              color: '#15803D',
              fontWeight: 600,
              marginTop: 3,
              marginLeft: 18,
            }}
          >
            Vuelto a preparar: <span className="tv-mono">{soles(order.cashChange)}</span>
          </div>
        )}
      </div>
    )

  return null
}

const cardHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.boxShadow = 'none'
  },
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
    <div
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'flex-start',
        fontSize: 11,
        color: 'var(--tv-ink-muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <MS name="location_on" size={11} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.addressRef}</span>
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
      <div
        style={{
          marginTop: 7,
          borderRadius: 9,
          border: '1px dashed var(--tv-border)',
          padding: '7px 9px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--tv-ink-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <MS name="phone_disabled" size={13} />
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
      className={`tv-btn tv-btn-sm tv-btn-block${alarma ? ' tv-pulse' : ''}`}
      style={{
        marginTop: 7,
        flexShrink: 0,
        ...(alarma
          ? { background: 'var(--tv-danger)', color: '#fff', border: 'none' }
          : { background: '#fff', color: '#C2410C', border: '1px solid #FDBA74' }),
      }}
    >
      <MS name="call" size={14} filled={alarma} />
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
  const ss = COOKING_STATE_STYLE[order.state] ?? {
    border: 'var(--tv-border)',
    borderW: '1px',
    bg: '#fff',
  }
  return (
    <div
      {...clickProps(order, onOpen)}
      {...cardHover}
      style={{
        background: ss.bg,
        borderRadius: 12,
        border: `${ss.borderW} solid ${ss.border}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        transition: 'box-shadow 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span
          className="tv-mono"
          style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}
        >
          #{order.id}
        </span>
        <SourceBadgeMini source={order.source} />
        <div style={{ flex: 1 }} />
        <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>
          {soles(order.total)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {order.addressRef && (
        <div style={{ marginBottom: 6 }}>
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
  const borderColor = isUrgent ? '#FCA5A5' : '#FDBA74'

  return (
    <div
      {...clickProps(order, onOpen)}
      {...cardHover}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        transition: 'box-shadow 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span
          className="tv-mono"
          style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}
        >
          #{order.id}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <MS
            name="timer"
            size={11}
            style={{ color: isUrgent ? 'var(--tv-danger)' : 'var(--tv-brand)', flexShrink: 0 }}
          />
          <span
            className="tv-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isUrgent ? 'var(--tv-danger)' : 'var(--tv-brand)',
            }}
          >
            {mmss(order.countdownSec)}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {order.status === 'awaiting_payment' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: '#FFF7ED',
              color: '#C2410C',
              padding: '2px 6px',
              borderRadius: 6,
              border: '1px solid #FFEDD5',
            }}
          >
            Esperando pago
          </span>
        )}
        {order.status === 'validando' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              background: '#EFF6FF',
              color: '#1D4ED8',
              padding: '2px 6px',
              borderRadius: 6,
              border: '1px solid #BFDBFE',
            }}
          >
            Validando
          </span>
        )}
        <SourceBadgeMini source={order.source} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <PayBadgeMini payment={order.payment} />
          <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>
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
  const border = isHigh ? '#FDBA74' : isMed ? '#FDE68A' : 'var(--tv-border)'

  const driverName = order.driver?.name ?? 'Motorizado'
  const statusDot = isHigh ? '#F97316' : isMed ? '#EAB308' : null
  const statusColor = isHigh ? '#C2410C' : isMed ? '#B45309' : '#6D28D9'
  const statusText = isHigh
    ? `Reparto demorado · hace ${mAgo}m`
    : isMed
      ? `En camino mucho tiempo · hace ${mAgo}m`
      : `${driverName} entregando · hace ${mAgo}m`

  return (
    <div
      {...clickProps(order, onOpen)}
      {...cardHover}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${border}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        transition: 'box-shadow 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span
          className="tv-mono"
          style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}
        >
          #{order.id}
        </span>
        <SourceBadgeMini source={order.source} />
        <div style={{ flex: 1 }} />
        <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>
          {soles(order.total)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.customer ?? 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {order.addressRef && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--tv-ink-muted)',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.addressRef}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {statusDot ? (
          <span
            style={{ width: 7, height: 7, borderRadius: 999, background: statusDot, flexShrink: 0 }}
          />
        ) : (
          <MS name="delivery_dining" size={13} style={{ color: statusColor, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, color: statusColor, fontWeight: isMed || isHigh ? 600 : 500 }}>
          {statusText}
        </span>
      </div>
    </div>
  )
}
