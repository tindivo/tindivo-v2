/**
 * El techo de deuda que se le enseña al negocio en su pantalla de saldo:
 * la barra de «Límite de crédito» y el «X% del límite alcanzado».
 *
 * **Es un número informativo, no una regla que se aplique sola.** Verificado
 * leyendo los cuerpos de las funciones en la base:
 *
 *   · `recalc_business_balance` corre en CADA cargo y solo vuelve a sumar el
 *     ledger. No compara la deuda con ningún tope.
 *   · `block_business(id, motivo, por)` no recibe ni consulta importe alguno:
 *     la dispara el admin desde `POST /admin/businesses/:id/block`.
 *   · No hay cron ni Inngest que barra deudores.
 *
 * El bloqueo en sí **sí funciona**: pone `is_blocked`, y `is_published_business`
 * exige `is_blocked = false`, así que el negocio desaparece del catálogo y deja
 * de recibir pedidos. Lo que no existe es el automatismo por monto. Subir o
 * bajar este valor cambia lo que ve la cajera y cuándo la barra se pone roja
 * (a partir del 80%) — nada más.
 *
 * Ojo con `blocked_for_debt`, que es OTRA columna: hoy no la enciende ni una
 * sola línea de producción (solo `settle_business_charges` y `unblock_business`
 * la apagan al pagar). El estado «Cuenta suspendida» de esta pantalla viene de
 * `is_blocked`, no de ella.
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
