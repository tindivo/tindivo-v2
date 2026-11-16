// Texto del aviso al cliente cuando un pedido se cancela solo (`OrderExpired`). Puro y sin
// imports de Deno, para probarlo desde vitest (apps/api/lib/__tests__/send-push-expired-text.test.ts).
//
// El título no cambia; el cuerpo depende de por qué se canceló. `prepay_timeout` tiene dos
// situaciones distintas con el mismo motivo (bloques 2 y 4 de `cancel_expired_prepay_orders`):
//   · el cliente nunca pagó ni subió comprobante  -> puede volver a pedir.
//   · el cliente SÍ subió comprobante y nadie lo revisó (bloque 4) -> su dinero pudo haber
//     salido: que hable con Tindivo, que revisa su caso (no se promete devolución).
// Se distingue por la base y no por el payload del evento (la ruta `expire_order` de Inngest
// no lo trae): un comprobante sin revisar es `payment_proof_status = 'pending'` con
// `proof_attempt > 0`. Si la cajera lo hubiera revisado quedaría 'verified' o 'rejected'.

export const EXPIRED_TITLE = 'Tu pedido se canceló'

const DEFAULT_BODY = 'No llegó el pago a tiempo · puedes volver a pedirlo'

export type ExpiredContext = {
  cancelReason: unknown
  paymentProofStatus: unknown
  proofAttempt: unknown
}

export function expiredBody(ctx: ExpiredContext): string {
  switch (ctx.cancelReason) {
    case 'pending_acceptance_timeout':
      return 'El negocio no respondió a tiempo · puedes volver a pedirlo'
    case 'validation_timeout':
      return 'No pudimos confirmar tu pedido a tiempo · puedes volver a pedirlo'
    case 'prepay_timeout': {
      const attempts = typeof ctx.proofAttempt === 'number' ? ctx.proofAttempt : 0
      if (ctx.paymentProofStatus === 'pending' && attempts > 0) {
        return 'No se pudo revisar tu pago a tiempo. Comunícate con Tindivo y revisamos tu caso.'
      }
      return DEFAULT_BODY
    }
    default:
      return DEFAULT_BODY
  }
}
