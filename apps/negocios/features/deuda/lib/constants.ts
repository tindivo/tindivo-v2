/**
 * Fallback del límite de crédito, para el instante en que la pantalla todavía
 * no recibió la respuesta del endpoint de saldo.
 *
 * **El valor que manda vive en `app_settings.debt_block_threshold`** y lo aplica
 * `recalc_business_balance` (migración 0178): al alcanzarlo, el negocio queda
 * suspendido y el trigger `trg_orders_business_not_blocked` le impide recibir
 * pedidos nuevos — también por enlace directo, que era por donde se colaban
 * antes. Al bajar del umbral se le levanta la suspensión solo, sin tener que
 * pagar la deuda entera.
 *
 * Este número era `BLOCK_THRESHOLD` y no hacía nada: pintaba la barra y punto.
 * Si alguna vez vuelve a divergir del de `app_settings`, lo que ve la cajera
 * dejará de ser lo que le van a aplicar.
 */
export const DEFAULT_BLOCK_THRESHOLD = 600

export const REJECTION_LABELS: Record<string, string> = {
  invalid_proof: 'Comprobante de pago inválido',
  out_of_stock: 'Sin stock / Productos no disponibles',
  closed: 'Local/Restaurante cerrado',
  out_of_zone: 'Dirección fuera de zona de entrega',
  no_answer: 'Cliente no responde al contacto',
  other: 'Otro motivo de rechazo',
}

export const EVENT_LABELS: Record<string, string> = {
  'order.created': 'Pedido creado',
  'order.status_changed': 'Estado cambiado',
  'order.prepay_proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_uploaded': 'Comprobante subido por cliente',
  'order.proof_rejected': 'Restaurante rechazó el comprobante',
  'order.validation_failed_retry': 'Restaurante rechazó el comprobante',
  'order.validation_failed': 'Rechazo definitivo — pedido cancelado',
  'order.validation_passed': 'Comprobante confirmado',
  'order.proof_confirmed': 'Comprobante confirmado',
  'order.cancelled': 'Pedido cancelado',
  'order.appeal_created': 'Cliente inició apelación',
  'order.appeal_in_review': 'Admin marcó en revisión',
  'order.appeal_resolved': 'Apelación resuelta',
  'order.refund_registered': 'Devolución registrada',
  'order.fallback_review_created': 'Revisión automática (sin apelación 24h)',
}
