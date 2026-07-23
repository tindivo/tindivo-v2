import { describe, expect, it } from 'vitest'
import { CANCEL_REASON_DETAILS, CancelReasonDetailSchema } from '../enums'

describe('CancelReasonDetailSchema', () => {
  it('valida todos los motivos de cancelación manual de negocio permitidos', () => {
    for (const reason of CANCEL_REASON_DETAILS) {
      expect(CancelReasonDetailSchema.parse(reason)).toBe(reason)
    }
  })

  it('rechaza motivos no reconocidos', () => {
    expect(() => CancelReasonDetailSchema.parse('invalid_reason')).toThrow()
  })
})
