import { describe, expect, it } from 'vitest'
import {
  AdminAppealDtoSchema,
  AppealListQuerySchema,
  CreateAppealSchema,
  CustomerAppealDtoSchema,
  RegisterRefundSchema,
  ResolveAppealSchema,
} from '../appeal'
import {
  AppealCreatedData,
  extractStoragePaths,
  PrepayProofUploadedData,
  RefundRegisteredData,
  ValidationFailedData,
  ValidationFailedRetryData,
} from '../order-events'

describe('Contratos de Apelaciones y Devoluciones', () => {
  // ── CreateAppealSchema ─────────────────────────────────────────────────

  it('valida payload de creación de apelación', () => {
    const valid = CreateAppealSchema.parse({ description: 'Comprobante Yape verificado' })
    expect(valid.description).toBe('Comprobante Yape verificado')

    const empty = CreateAppealSchema.parse({})
    expect(empty.description).toBeUndefined()
  })

  it('rechaza propiedades desconocidas (strict)', () => {
    expect(() => CreateAppealSchema.parse({ description: 'test', extra: 'no-permitido' })).toThrow()
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
    expect(() => RegisterRefundSchema.parse({ refundProofPath: '', amount: 25.5 })).toThrow()
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
      refundProofUrl: null,
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

// ── Order Event Data Schemas ─────────────────────────────────────────────

describe('Schemas de order_event_log.data', () => {
  it('PrepayProofUploadedData acepta data completo', () => {
    const parsed = PrepayProofUploadedData.parse({
      proof_path: 'user-uuid/order-uuid/attempt-2-1234567890.jpg',
      attempt: 2,
    })
    expect(parsed.proof_path).toBe('user-uuid/order-uuid/attempt-2-1234567890.jpg')
    expect(parsed.attempt).toBe(2)
  })

  it('PrepayProofUploadedData tolera data vacío (eventos legados)', () => {
    const parsed = PrepayProofUploadedData.parse({})
    expect(parsed.proof_path).toBeUndefined()
    expect(parsed.attempt).toBeUndefined()
  })

  it('PrepayProofUploadedData ignora campos desconocidos (passthrough)', () => {
    const parsed = PrepayProofUploadedData.parse({
      proof_path: 'path.jpg',
      attempt: 1,
      futuro: 'no-rompe',
    })
    expect(parsed.proof_path).toBe('path.jpg')
  })

  it('ValidationFailedRetryData acepta data completo con proof_path', () => {
    const parsed = ValidationFailedRetryData.parse({
      reason: 'Monto no coincide',
      reasonCode: 'invalid_proof',
      attempt: 1,
      proof_path: 'user-uuid/order-uuid/attempt-1-1234567890.jpg',
    })
    expect(parsed.reason).toBe('Monto no coincide')
    expect(parsed.proof_path).toBe('user-uuid/order-uuid/attempt-1-1234567890.jpg')
  })

  it('ValidationFailedRetryData tolera data sin proof_path (legado)', () => {
    const parsed = ValidationFailedRetryData.parse({
      reason: 'Monto no coincide',
      reasonCode: 'invalid_proof',
      attempt: 1,
    })
    expect(parsed.proof_path).toBeUndefined()
  })

  it('ValidationFailedData acepta data completo con proof_path', () => {
    const parsed = ValidationFailedData.parse({
      reason: 'Legibilidad',
      reasonCode: 'invalid_proof',
      proof_path: 'path.jpg',
    })
    expect(parsed.reason).toBe('Legibilidad')
    expect(parsed.proof_path).toBe('path.jpg')
  })

  it('ValidationFailedData tolera data vacío', () => {
    const parsed = ValidationFailedData.parse({})
    expect(parsed.reason).toBeUndefined()
  })

  it('AppealCreatedData acepta data con evidence_url y description', () => {
    const parsed = AppealCreatedData.parse({
      reportId: '11111111-1111-4111-8111-111111111111',
      evidence_url: 'path/to/proof.jpg',
      description: 'Cliente apela rechazo final',
    })
    expect(parsed.reportId).toBe('11111111-1111-4111-8111-111111111111')
    expect(parsed.evidence_url).toBe('path/to/proof.jpg')
    expect(parsed.description).toBe('Cliente apela rechazo final')
  })

  it('AppealCreatedData tolera data solo con reportId (legado)', () => {
    const parsed = AppealCreatedData.parse({
      reportId: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed.reportId).toBe('11111111-1111-4111-8111-111111111111')
    expect(parsed.evidence_url).toBeUndefined()
  })

  it('RefundRegisteredData acepta data completo', () => {
    const parsed = RefundRegisteredData.parse({
      reportId: '11111111-1111-4111-8111-111111111111',
      amount: 25.5,
      proofPath: 'refunds/report-id_1234567890.jpg',
    })
    expect(parsed.amount).toBe(25.5)
    expect(parsed.proofPath).toBe('refunds/report-id_1234567890.jpg')
  })

  it('RefundRegisteredData tolera data vacío', () => {
    const parsed = RefundRegisteredData.parse({})
    expect(parsed.amount).toBeUndefined()
  })

  // ── extractStoragePaths ──────────────────────────────────────────────

  it('extractStoragePaths extrae proof_path, evidence_url y proofPath', () => {
    const paths = extractStoragePaths({
      proof_path: 'a/b.jpg',
      evidence_url: 'c/d.png',
      proofPath: 'e/f.webp',
      other: 'ignored',
    })
    expect(paths).toEqual(['a/b.jpg', 'c/d.png', 'e/f.webp'])
  })

  it('extractStoragePaths ignora valores no-string', () => {
    const paths = extractStoragePaths({
      proof_path: 123,
      evidence_url: null,
      proofPath: '',
    })
    expect(paths).toEqual([])
  })

  it('extractStoragePaths retorna [] para data null/undefined', () => {
    expect(extractStoragePaths(null)).toEqual([])
    expect(extractStoragePaths(undefined)).toEqual([])
  })
})
