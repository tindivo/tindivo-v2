import { describe, expect, it } from 'vitest'
import {
  EXPIRED_TITLE,
  expiredBody,
} from '../../../../supabase/functions/send-push/expired-text.ts'

const base = { paymentProofStatus: null, proofAttempt: 0 }

describe('aviso de pedido cancelado solo (OrderExpired)', () => {
  it('el título no cambia', () => {
    expect(EXPIRED_TITLE).toBe('Tu pedido se canceló')
  })

  it('el negocio no respondió', () => {
    expect(expiredBody({ ...base, cancelReason: 'pending_acceptance_timeout' })).toBe(
      'El negocio no respondió a tiempo · puedes volver a pedirlo',
    )
  })

  it('contraentrega sin validar', () => {
    expect(expiredBody({ ...base, cancelReason: 'validation_timeout' })).toBe(
      'No pudimos confirmar tu pedido a tiempo · puedes volver a pedirlo',
    )
  })

  it('prepago con comprobante enviado y sin revisar: que hable con Tindivo', () => {
    expect(
      expiredBody({
        cancelReason: 'prepay_timeout',
        paymentProofStatus: 'pending',
        proofAttempt: 1,
      }),
    ).toBe('No se pudo revisar tu pago a tiempo. Comunícate con Tindivo y revisamos tu caso.')
  })

  it('prepago sin comprobante: el texto de siempre', () => {
    const viejo = 'No llegó el pago a tiempo · puedes volver a pedirlo'
    expect(expiredBody({ ...base, cancelReason: 'prepay_timeout' })).toBe(viejo)
    // un comprobante rechazado ya fue revisado: no es «el negocio no revisó»
    expect(
      expiredBody({
        cancelReason: 'prepay_timeout',
        paymentProofStatus: 'rejected',
        proofAttempt: 1,
      }),
    ).toBe(viejo)
    expect(
      expiredBody({
        cancelReason: 'prepay_timeout',
        paymentProofStatus: 'pending',
        proofAttempt: 0,
      }),
    ).toBe(viejo)
  })

  it('motivo desconocido o nulo: el texto de siempre', () => {
    const viejo = 'No llegó el pago a tiempo · puedes volver a pedirlo'
    expect(expiredBody({ ...base, cancelReason: null })).toBe(viejo)
    expect(expiredBody({ ...base, cancelReason: 'otro' })).toBe(viejo)
    expect(expiredBody({ ...base, cancelReason: undefined })).toBe(viejo)
  })
})
