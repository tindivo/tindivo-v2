/**
 * Decisores de presentación visual para las tarjetas del Dashboard de Negocios (Vista Cajera).
 * Función pura desacoplada del JSX, con 100% de testabilidad en Vitest.
 */

import {
  formatReadyDelta,
  type OrderVM,
  type UiPayment,
  type UiSource,
  type UiState,
} from './view-model'

export type CardTone = 'neutral' | 'warning' | 'danger' | 'brand'

export interface SourceBadge {
  label: 'Manual' | 'Online'
  icon: string
  className: string
}

export interface StateBadge {
  label: string
  icon: string
  className: string
}

export interface CardClock {
  text: string
  tone: CardTone
  readyBadge?: boolean
  label?: string
}

export interface MoneyInfo {
  totalHeadline: string
  paymentLabel: string
  paymentClassName: string
  cashChangeText: string | null
}

export type ActionType = 'accept' | 'validate' | 'ready' | 'callDriver' | 'deliver'

export interface CardPrimaryAction {
  type: ActionType
  label: string
  isUrgent: boolean
  phoneToCall?: string
}

export interface NegociosCardVM {
  rowId: string
  shortId: string
  sourceBadge: SourceBadge
  methodBadge: { label: string; icon: string }
  stateBadge: StateBadge
  customerName: string
  customerPhone: string | null
  clock: CardClock | null
  reference: string | null
  money: MoneyInfo
  riskLabel: string | null
  primaryAction: CardPrimaryAction | null
  tone: CardTone
  isUrgent: boolean
}

// ── Mapeos de Origen (Diferenciación Manual vs Online) ─────────────────────────
export const SOURCE_BADGE_MAP: Record<UiSource, SourceBadge> = {
  manual: {
    label: 'Manual',
    icon: 'call',
    className: 'bg-amber-100 text-amber-900 border border-amber-300/60 font-bold',
  },
  web: {
    label: 'Online',
    icon: 'language',
    className: 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold',
  },
}

// ── Mapeos de Estado ─────────────────────────────────────────────────────────
export const STATE_BADGE_MAP: Record<UiState, StateBadge> = {
  pending_acceptance: {
    label: 'Por Aceptar',
    icon: 'schedule',
    className: 'bg-amber-50 text-amber-800',
  },
  validando: { label: 'Validando', icon: 'shield', className: 'bg-sky-50 text-sky-800' },
  awaiting_payment: {
    label: 'Esperando Pago',
    icon: 'qr_code_2',
    className: 'bg-amber-50 text-amber-800',
  },
  cooking: { label: 'En Cocina', icon: 'soup_kitchen', className: 'bg-amber-50 text-amber-900' },
  buffer_p1: {
    label: 'Lista · Esperando',
    icon: 'check_circle',
    className: 'bg-amber-100 text-amber-900 font-bold',
  },
  buffer_p2: {
    label: 'Sin Motorizado',
    icon: 'warning',
    className: 'bg-orange-100 text-orange-900 font-bold',
  },
  buffer_p3: {
    label: '¡Pedir Moto!',
    icon: 'priority_high',
    className: 'bg-red-100 text-red-900 font-bold',
  },
  heading: {
    label: 'Motorizado en Camino',
    icon: 'two_wheeler',
    className: 'bg-sky-50 text-sky-800',
  },
  waiting: {
    label: 'Motorizado Llegó',
    icon: 'local_shipping',
    className: 'bg-emerald-100 text-emerald-900 font-bold',
  },
  picked_up: {
    label: 'En Reparto',
    icon: 'delivery_dining',
    className: 'bg-violet-50 text-violet-800',
  },
  delivered: {
    label: 'Entregado',
    icon: 'check_circle',
    className: 'bg-ink/[0.05] text-ink-muted',
  },
  cancelled: { label: 'Cancelado', icon: 'cancel', className: 'bg-red-50 text-red-700' },
}

export const PAY_CLASS_MAP: Record<UiPayment, string> = {
  pending_cash: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  pending_wallet: 'bg-violet-50 text-violet-800 border border-violet-200',
  prepaid: 'bg-sky-50 text-sky-800 border border-sky-200',
  pending_mixed: 'bg-amber-50 text-amber-800 border border-amber-200',
}

export const PAY_LABEL_MAP: Record<UiPayment, string> = {
  pending_cash: 'Efectivo',
  pending_wallet: 'Billetera Digital',
  prepaid: 'Prepago',
  pending_mixed: 'Mixto',
}

const RISK_REASON_LABEL: Record<string, string> = {
  gps_warning_zone: 'Validar · Zona ampliada',
  same_phone_burst: 'Validar · Varios pedidos',
  nearby_address_burst: 'Validar · Direcciones cercanas',
  new_phone_high_ticket_burst: 'Validar · Patrón inusual',
  order_spike: 'Validar · Pico de pedidos',
  standard_validation_rule: 'Validar antes de cocinar',
}

function soles(n: number): string {
  return `S/ ${Number(n).toFixed(2).replace(/\.00$/, '')}`
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Función pura que transforma un OrderVM en las decisiones visuales exactas de la tarjeta de la cajera.
 */
export function buildNegociosCardVM(
  order: OrderVM,
  options?: {
    queueLeadMin?: number
    supportPhone?: string | null
  },
): NegociosCardVM {
  const queueLeadMin = options?.queueLeadMin ?? 5
  const supportPhone = options?.supportPhone ?? null

  // 1. Origen
  const sourceBadge = SOURCE_BADGE_MAP[order.source] ?? SOURCE_BADGE_MAP.web

  // 2. Método de entrega
  const methodBadge =
    order.method === 'pickup'
      ? { label: 'Recojo en local', icon: 'storefront' }
      : { label: 'Delivery', icon: 'two_wheeler' }

  // 3. Estado Badge
  const stateBadge = STATE_BADGE_MAP[order.state] ?? STATE_BADGE_MAP.cooking

  // 4. Urgencia
  const isUrgent =
    order.state === 'buffer_p3' ||
    order.state === 'buffer_p2' ||
    (order.readySec != null && order.readySec < 0) ||
    order.state === 'waiting' ||
    (order.state === 'pending_acceptance' && order.countdownSec < 60)

  const tone: CardTone =
    order.state === 'buffer_p3' || (order.state === 'pending_acceptance' && order.countdownSec < 60)
      ? 'danger'
      : order.state === 'buffer_p2' || order.state === 'waiting'
        ? 'brand'
        : order.readySec != null && order.readySec < 0
          ? 'warning'
          : 'neutral'

  // 5. Reloj
  let clock: CardClock | null = null

  if (
    order.state === 'pending_acceptance' ||
    order.state === 'validando' ||
    order.state === 'awaiting_payment'
  ) {
    const isRed = order.countdownSec < 60
    clock = {
      text: mmss(order.countdownSec),
      tone: isRed ? 'danger' : 'brand',
      label: 'Atender',
    }
  } else if (order.readySec != null) {
    if (order.readySec < 0) {
      const elapsedSec = Math.abs(order.readySec)
      const isAmber = elapsedSec <= queueLeadMin * 60
      clock = {
        text: formatReadyDelta(order.readySec),
        tone: isAmber ? 'warning' : 'danger',
        readyBadge: order.readyEarly,
        label: order.readyEarly ? 'Listo' : 'Demorado',
      }
    } else {
      clock = {
        text: `${Math.ceil(order.readySec / 60)}m`,
        tone: 'neutral',
        readyBadge: order.readyEarly,
        label: 'En cocina',
      }
    }
  } else if (order.minutesLeft != null) {
    clock = {
      text: `${order.minutesLeft}m`,
      tone: 'neutral',
      readyBadge: order.readyEarly,
      label: 'Cocina',
    }
  }

  // 6. Cobro y Vuelto
  let cashChangeText: string | null = null
  if (order.cashChange != null && order.cashChange > 0) {
    cashChangeText = `Vuelto a entregar: ${soles(order.cashChange)}`
  }

  const money: MoneyInfo = {
    totalHeadline: soles(order.total),
    paymentLabel: PAY_LABEL_MAP[order.payment] ?? 'Efectivo',
    paymentClassName: PAY_CLASS_MAP[order.payment] ?? PAY_CLASS_MAP.pending_cash,
    cashChangeText,
  }

  // 7. Riesgo
  const riskLabel = order.requiresValidation
    ? (RISK_REASON_LABEL[order.validationReasonCode ?? ''] ?? 'Validar antes de cocinar')
    : null

  // 8. Acción 1-Tap
  let primaryAction: CardPrimaryAction | null = null

  if (order.state === 'waiting') {
    primaryAction = {
      type: 'deliver',
      label: `${order.driver?.name ?? 'Motorizado'} llegó · Entregar`,
      isUrgent: true,
    }
  } else if (order.state === 'buffer_p2' || order.state === 'buffer_p3') {
    const alarma = order.state === 'buffer_p3'
    primaryAction = {
      type: 'callDriver',
      label: alarma ? 'Pedir motorizado YA' : 'Pedir motorizado',
      isUrgent: true,
      phoneToCall: supportPhone ?? undefined,
    }
  }

  return {
    rowId: order.rowId,
    shortId: order.id,
    sourceBadge,
    methodBadge,
    stateBadge,
    customerName: order.customer ?? 'Cliente',
    customerPhone: order.phone,
    clock,
    reference: order.method === 'pickup' ? 'Recojo en local' : order.addressRef,
    money,
    riskLabel,
    primaryAction,
    tone,
    isUrgent,
  }
}
