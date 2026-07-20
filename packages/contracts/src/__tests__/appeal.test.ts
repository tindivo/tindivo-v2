import { describe, expect, it } from 'vitest'
import {
  CreateAppealSchema,
  RegisterRefundSchema,
  ResolveAppealSchema,
} from '../appeal'

describe('Contratos de Apelaciones y Devoluciones', () => {
  it('valida payload de creación de apelación', () => {
    const valid = CreateAppealSchema.parse({ description: 'Comprobante Yape verificado' })
    expect(valid.description).toBe('Comprobante Yape verificado')

    const empty = CreateAppealSchema.parse({})
    expect(empty.description).toBeUndefined()
  })

  it('valida resolución de apelación como favor_cliente o favor_restaurante', () => {
    const res = ResolveAppealSchema.parse({ resolution: 'favor_cliente', note: 'Aprobado por Yape' })
    expect(res.resolution).toBe('favor_cliente')

    expect(() => ResolveAppealSchema.parse({ resolution: 'invalido' })).toThrow()
  })

  it('valida registro de devolución con ruta de comprobante y monto positivo', () => {
    const refund = RegisterRefundSchema.parse({ refundProofPath: 'proofs/refund_01.png', amount: 25.5 })
    expect(refund.amount).toBe(25.5)

    expect(() => RegisterRefundSchema.parse({ refundProofPath: '', amount: 25.5 })).toThrow()
    expect(() => RegisterRefundSchema.parse({ refundProofPath: 'proofs/refund_01.png', amount: -5 })).toThrow()
  })
})
