/**
 * Fallback del límite de crédito, para el instante en que la pantalla todavía no
 * recibió la respuesta del endpoint de saldo.
 *
 * **El valor que se pinta vive en `app_settings.debt_block_threshold`**, y es
 * informativo: alcanzarlo NO suspende a nadie. La `0178` llegó a conectarlo con
 * la suspensión automática y la `0179` lo revirtió — en el piloto, cortar solo
 * significaba que un negocio podía quedarse sin vender un viernes por la noche
 * sin que nadie lo decidiera, y en silencio, porque `dispatch_event` no
 * convierte `BusinessBlocked` en push. Suspender lo sigue decidiendo el admin.
 *
 * Así que este número mueve el cartel y el porcentaje de la barra. Nada más.
 * Lo que SÍ corta pedidos es `is_blocked`, lo ponga quien lo ponga.
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
