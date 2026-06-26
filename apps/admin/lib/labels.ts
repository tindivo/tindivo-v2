export type Tone = 'info' | 'warning' | 'brand' | 'success' | 'danger' | 'neutral'

/** Estado de pedido → etiqueta + tono semántico (color en StatusBadge). */
export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  validando: { label: 'Validando', tone: 'info' },
  pending_acceptance: { label: 'Por aceptar', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  preparing: { label: 'Preparando', tone: 'brand' },
  waiting_driver: { label: 'Busca moto', tone: 'brand' },
  heading_to_restaurant: { label: 'Moto en camino', tone: 'brand' },
  waiting_at_restaurant: { label: 'Moto en local', tone: 'brand' },
  picked_up: { label: 'En reparto', tone: 'info' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const PAYMENT_INTENT_LABEL: Record<string, string> = {
  pending_cash: 'Efectivo',
  pending_yape: 'Yape al recibir',
  prepaid: 'Prepago',
  pending_mixed: 'Mixto',
}

export const STATEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Por cobrar', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  overdue: { label: 'Vencido', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}

export const ADVANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  activo: { label: 'Activo', tone: 'info' },
  disputado: { label: 'En disputa', tone: 'warning' },
  cancelado: { label: 'Cancelado · Tindivo absorbe', tone: 'neutral' },
}

export const REPORT_TYPE_LABEL: Record<string, string> = {
  no_show: 'No-show',
  rejected_proof_disputed: 'Comprobante disputado',
  cash_difference: 'Diferencia de efectivo',
  restaurant_fake: 'Pedido fantasma',
  strike_reactivation: 'Reactivación de strike',
  advance_dispute: 'Disputa de adelanto',
  prepay_refund_review: 'Devolución de prepago',
}

/** Tipo de incidente del motorizado → etiqueta (antifraude v1). */
export const INCIDENT_TYPE_LABEL: Record<string, string> = {
  no_show: 'Cliente no se presentó',
  fake_address: 'Dirección falsa',
  customer_abuse: 'Cliente abusivo',
  payment_fraud: 'Fraude de pago',
  rejected_proof: 'Comprobante rechazado',
  other: 'Otro',
}

export const CANCEL_LABEL: Record<string, string> = {
  pending_acceptance_timeout: 'No aceptado a tiempo',
  validation_timeout: 'Sin validar',
  prepay_timeout: 'Prepago sin comprobante',
  business_cancelled: 'Negocio canceló',
  admin_cancelled: 'Admin canceló',
  customer_cancelled: 'Cliente canceló',
  no_show: 'No-show',
}

export const ADVANCE_REASONS: { reason: string; actor: 'restaurante' | 'tindivo' }[] = [
  { reason: 'Prepago: el restaurante no aceptó en 5 min', actor: 'restaurante' },
  { reason: 'Prepago: el restaurante rechazó la captura sin razón válida', actor: 'restaurante' },
  { reason: 'Prepago: el restaurante no preparó a tiempo', actor: 'restaurante' },
  { reason: 'Prepago: el motorizado no recogió / abandonó el pedido', actor: 'tindivo' },
  { reason: 'Prepago: el cliente canceló en ventana libre', actor: 'tindivo' },
  { reason: 'Otro (especificar)', actor: 'restaurante' },
]

export const WEEKDAYS: [string, string][] = [
  ['mon', 'Lun'],
  ['tue', 'Mar'],
  ['wed', 'Mié'],
  ['thu', 'Jue'],
  ['fri', 'Vie'],
  ['sat', 'Sáb'],
  ['sun', 'Dom'],
]

export const TIMER_FIELDS: [string, string][] = [
  ['acceptanceMinutes', 'Aceptación (min)'],
  ['validationMinutes', 'Validación (min)'],
  ['prepayVerificationMinutes', 'Prepago (min)'],
  ['prepExtensionMinutes', 'Prórroga prep. (min)'],
  ['maxPrepExtensions', 'Máx. prórrogas'],
  ['noShowWaitMinutes', 'Espera no-show (min)'],
  ['cashAutoConfirmHours', 'Auto-confirma efectivo (h)'],
]

export const RANGES: [string, string][] = [
  ['today', 'Hoy'],
  ['7d', '7 días'],
  ['30d', '30 días'],
]

export const ACTIVE_STATUSES = new Set([
  'validando',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
])
