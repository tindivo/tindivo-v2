/**
 * El techo de deuda que se le enseña al negocio en su pantalla de saldo:
 * la barra de «Límite de crédito» y el «X% del límite alcanzado».
 *
 * **Es un número informativo, no una regla que se aplique sola.** Nadie bloquea
 * a un negocio al llegar aquí: `blocked_for_debt` solo se APAGA automáticamente
 * (lo hacen `settle_business_charges` y `unblock_business` cuando el negocio
 * paga), y encenderlo es una acción manual del admin desde su panel. Así que
 * subir o bajar este valor cambia lo que ve la cajera y el momento en que la
 * barra se pone roja —nada más—.
 *
 * Si algún día se automatiza la suspensión por mora, el umbral tiene que salir
 * de `app_settings` y leerlo los dos lados; no de aquí.
 */
export const BLOCK_THRESHOLD = 500

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
