import { describe, expect, it } from 'vitest'
import {
  AdminAppealDtoSchema,
  AppealListQuerySchema,
  CreateAppealSchema,
  CustomerAppealDtoSchema,
  RegisterRefundSchema,
  ResolveAppealSchema,
} from '../appeal'

describe('Contratos de Apelaciones y Devoluciones', () => {
  // ── CreateAppealSchema ─────────────────────────────────────────────────

  it('valida payload de creación de apelación', () => {
    const valid = CreateAppealSchema.parse({ description: 'Comprobante Yape verificado' })
    expect(valid.description).toBe('Comprobante Yape verificado')

    const empty = CreateAppealSchema.parse({})
    expect(empty.description).toBeUndefined()
  })

  it('rechaza propiedades desconocidas (strict)', () => {
    expect(() =>
      CreateAppealSchema.parse({ description: 'test', extra: 'no-permitido' }),
    ).toThrow()
  })

  // ── ResolveAppealSchema ────────────────────────────────────────────────

  it('valida resolución de apelación como favor_cliente o favor_restaurante', () => {
    const res = ResolveAppealSchema.parse({
      resolution: 'favor_cliente',
      note: 'Aprobado por Yape',
    })
    expect(res.resolution).toBe('favor_cliente')
    expect(res.note).toBe('Aprobado por Yape')

    expect(() => ResolveAppealSchema.parse({ resolution: 'invalido' })).toThrow()
  })

  it('rechaza note con más de 1000 caracteres', () => {
    expect(() =>
      ResolveAppealSchema.parse({ resolution: 'favor_cliente', note: 'x'.repeat(1001) }),
    ).toThrow()
  })

  it('rechaza propiedades desconocidas en payload de resolución (strict)', () => {
    expect(() =>
      ResolveAppealSchema.parse({
        resolution: 'favor_cliente',
        extraField: 'no-permitido',
      }),
    ).toThrow()
  })

  // ── RegisterRefundSchema ───────────────────────────────────────────────

  it('valida registro de devolución con ruta de comprobante y monto positivo', () => {
    const refund = RegisterRefundSchema.parse({
      refundProofPath: 'proofs/refund_01.png',
      amount: 25.5,
    })
    expect(refund.amount).toBe(25.5)
    expect(refund.refundProofPath).toBe('proofs/refund_01.png')
  })

  it('acepta rutas de storage válidas', () => {
    expect(() =>
      RegisterRefundSchema.parse({ refundProofPath: 'refunds/2024/proof.png', amount: 10 }),
    ).not.toThrow()
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'comprobantes/refund_01.webp',
        amount: 15.75,
      }),
    ).not.toThrow()
    expect(() =>
      RegisterRefundSchema.parse({ refundProofPath: 'a/b.png', amount: 1 }),
    ).not.toThrow()
  })

  it('rechaza refundProofPath como URL completa', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'https://dominio.com/comprobante.png',
        amount: 25.5,
      }),
    ).toThrow('Debe enviarse una ruta de Storage, no una URL')
  })

  it('rechaza refundProofPath con http://', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'http://dominio.com/comprobante.png',
        amount: 25.5,
      }),
    ).toThrow('Debe enviarse una ruta de Storage, no una URL')
  })

  it('rechaza refundProofPath que comienza con /', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: '/refunds/proof.png',
        amount: 25.5,
      }),
    ).toThrow('La ruta no debe comenzar con /')
  })

  it('rechaza refundProofPath con path traversal (..)', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: '../escape/proof.png',
        amount: 25.5,
      }),
    ).toThrow('La ruta contiene segmentos inválidos')
  })

  it('rechaza refundProofPath con backslash (\\)', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'refunds\\proof.png',
        amount: 25.5,
      }),
    ).toThrow('La ruta contiene segmentos inválidos')
  })

  it('rechaza refundProofPath sin separador / (archivo solo)', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'file',
        amount: 25.5,
      }),
    ).toThrow('Ruta de Storage inválida')
  })

  it('rechaza refundProofPath vacío', () => {
    expect(() =>
      RegisterRefundSchema.parse({ refundProofPath: '', amount: 25.5 }),
    ).toThrow()
  })

  it('rechaza monto negativo', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'proofs/refund_01.png',
        amount: -5,
      }),
    ).toThrow()
  })

  it('rechaza monto con más de 2 decimales', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'proofs/refund_01.png',
        amount: 10.999,
      }),
    ).toThrow('El monto debe tener precisión monetaria')
  })

  it('rechaza monto cero', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'proofs/refund_01.png',
        amount: 0,
      }),
    ).toThrow()
  })

  it('rechaza propiedades desconocidas en payload de refund (strict)', () => {
    expect(() =>
      RegisterRefundSchema.parse({
        refundProofPath: 'proofs/refund_01.png',
        amount: 25.5,
        extraField: 'no-permitido',
      }),
    ).toThrow()
  })

  // ── CustomerAppealDtoSchema ────────────────────────────────────────────

  it('valida CustomerAppealDtoSchema completo', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      appealStatus: 'pending',
      refundStatus: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: '2026-07-27T00:00:00.000Z',
      description: 'Mi comprobante fue rechazado',
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    }
    const parsed = CustomerAppealDtoSchema.parse(dto)
    expect(parsed.id).toBe(dto.id)
    expect(parsed.appealDeadline).toBe(dto.appealDeadline)
  })

  it('CustomerAppealDtoSchema rechaza campos administrativos (strict)', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      appealStatus: 'pending',
      refundStatus: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: null,
      description: null,
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      resolvedBy: '33333333-3333-4333-8333-333333333333', // campo admin
    }
    expect(() => CustomerAppealDtoSchema.parse(dto)).toThrow()
  })

  it('CustomerAppealDtoSchema rechaza refundProofPath (campo admin)', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      appealStatus: 'pending',
      refundStatus: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: null,
      description: null,
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      refundProofPath: 'secret/path.png', // no debe exponerse al cliente
    }
    expect(() => CustomerAppealDtoSchema.parse(dto)).toThrow()
  })

  // ── AdminAppealDtoSchema ───────────────────────────────────────────────

  it('valida AdminAppealDtoSchema completo con orderShortId', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      orderShortId: 'ABC12345',
      businessId: '33333333-3333-4333-8333-333333333333',
      customerUserId: '44444444-4444-4444-9444-444444444444',
      customerPhone: '+51999888777',
      customerName: 'Juan Pérez',
      description: 'Apelación de prueba',
      evidenceUrl: 'https://storage/evidence.png',
      appealStatus: 'in_review',
      refundStatus: null,
      refundProofPath: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      createdBy: '55555555-5555-4555-8555-555555555555',
      type: 'rejected_proof_disputed',
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      orderCreatedAt: '2026-07-20T00:00:00.000Z',
      businessName: 'Don Pepito',
      yapeNumber: '987654321',
      rejectionReasonCode: null,
      rejectionReasonText: null,
      proofAttempt: 1,
    }
    const parsed = AdminAppealDtoSchema.parse(dto)
    expect(parsed.orderShortId).toBe('ABC12345')
    expect(parsed.resolutionNote).toBeNull()
  })

  it('AdminAppealDtoSchema acepta orderShortId null (sin orden asociada)', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      orderShortId: null,
      businessId: '33333333-3333-4333-8333-333333333333',
      customerUserId: '44444444-4444-4444-9444-444444444444',
      customerPhone: null,
      customerName: null,
      description: null,
      evidenceUrl: null,
      appealStatus: 'pending',
      refundStatus: null,
      refundProofPath: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      createdBy: null,
      type: 'rejected_proof_disputed',
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      orderCreatedAt: null,
      businessName: null,
      yapeNumber: null,
      rejectionReasonCode: null,
      rejectionReasonText: null,
      proofAttempt: null,
    }
    const parsed = AdminAppealDtoSchema.parse(dto)
    expect(parsed.orderShortId).toBeNull()
  })

  it('AdminAppealDtoSchema rechaza propiedades desconocidas (strict)', () => {
    const dto = {
      id: '11111111-1111-4111-8111-111111111111',
      orderId: '22222222-2222-4222-8222-222222222222',
      orderShortId: null,
      businessId: '33333333-3333-4333-8333-333333333333',
      customerUserId: '44444444-4444-4444-9444-444444444444',
      customerPhone: null,
      customerName: null,
      description: null,
      evidenceUrl: null,
      appealStatus: 'pending',
      refundStatus: null,
      refundProofPath: null,
      refundAmount: null,
      refundCompletedAt: null,
      appealDeadline: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      createdBy: null,
      type: 'rejected_proof_disputed',
      status: 'open',
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      orderCreatedAt: null,
      businessName: null,
      yapeNumber: null,
      rejectionReasonCode: null,
      rejectionReasonText: null,
      proofAttempt: null,
      extra: 'no-permitido',
    }
    expect(() => AdminAppealDtoSchema.parse(dto)).toThrow()
  })

  // ── AppealListQuerySchema ──────────────────────────────────────────────

  it('valida query params con defaults', () => {
    const q = AppealListQuerySchema.parse({})
    expect(q.page).toBe(1)
    expect(q.per_page).toBe(50)
    expect(q.appeal_status).toBeUndefined()
  })

  it('valida query params completos', () => {
    const q = AppealListQuerySchema.parse({
      appeal_status: 'in_review',
      refund_status: 'pending',
      page: '3',
      per_page: '25',
    })
    expect(q.appeal_status).toBe('in_review')
    expect(q.page).toBe(3)
    expect(q.per_page).toBe(25)
  })

  it('rechaza page=0', () => {
    expect(() => AppealListQuerySchema.parse({ page: '0' })).toThrow()
  })

  it('rechaza per_page=101', () => {
    expect(() => AppealListQuerySchema.parse({ per_page: '101' })).toThrow()
  })
})
