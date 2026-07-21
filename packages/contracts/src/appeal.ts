import { z } from 'zod'

// ── Enums ──────────────────────────────────────────────────────────────────

export const AppealStatusSchema = z.enum([
  'pending',
  'in_review',
  'approved',
  'rejected',
])
export type AppealStatus = z.infer<typeof AppealStatusSchema>

export const RefundStatusSchema = z.enum(['pending', 'completed'])
export type RefundStatus = z.infer<typeof RefundStatusSchema>

// ── Payload Schemas (.strict() para rechazar propiedades desconocidas) ─────

export const CreateAppealSchema = z
  .object({
    description: z.string().trim().max(500).optional(),
  })
  .strict()
export type CreateAppealPayload = z.infer<typeof CreateAppealSchema>

export const ResolveAppealSchema = z
  .object({
    resolution: z.enum(['favor_cliente', 'favor_restaurante']),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
export type ResolveAppealPayload = z.infer<typeof ResolveAppealSchema>

export const RegisterRefundSchema = z
  .object({
    refundProofPath: z
      .string()
      .trim()
      .min(3, 'La ruta del comprobante es requerida')
      .max(500, 'La ruta es demasiado larga')
      .refine((value) => !/^https?:\/\//i.test(value), {
        message: 'Debe enviarse una ruta de Storage, no una URL',
      })
      .refine((value) => !value.startsWith('/'), {
        message: 'La ruta no debe comenzar con /',
      })
      .refine((value) => !value.includes('..') && !value.includes('\\'), {
        message: 'La ruta contiene segmentos inválidos',
      })
      .refine(
        (value) => /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(value),
        { message: 'Ruta de Storage inválida — use formato carpeta/archivo.ext' },
      ),
    amount: z
      .number()
      .finite('El monto debe ser un número finito')
      .positive('El monto debe ser positivo')
      .multipleOf(0.01, 'El monto debe tener precisión monetaria (máximo 2 decimales)'),
  })
  .strict()
export type RegisterRefundPayload = z.infer<typeof RegisterRefundSchema>

// ── Query & Response Schemas ───────────────────────────────────────────────

export const AppealListQuerySchema = z.object({
  appeal_status: z
    .enum(['pending', 'in_review', 'approved', 'rejected'])
    .optional(),
  refund_status: z.enum(['pending', 'completed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
})
export type AppealListQuery = z.infer<typeof AppealListQuerySchema>

// ── DTOs & Schemas (.strict() para rechazar propiedades desconocidas) ──────

/**
 * DTO que recibe el cliente dueño de la apelación.
 * Solo incluye información relevante para su caso.
 * NO expone UUIDs internos de admin, createdBy, refundProofPath ni campos operativos.
 */
export const CustomerAppealDtoSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    appealStatus: AppealStatusSchema,
    refundStatus: RefundStatusSchema.nullable(),
    refundAmount: z.number().positive().nullable(),
    refundCompletedAt: z.string().datetime().nullable(),
    appealDeadline: z.string().datetime().nullable(),
    description: z.string().nullable(),
    status: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type CustomerAppealDto = z.infer<typeof CustomerAppealDtoSchema>

/**
 * DTO completo para el panel admin.
 * Incluye auditoría (resolvedBy, createdBy, resolutionNote),
 * ownership (customerUserId, businessId),
 * campos operativos (refundProofPath, evidenceUrl),
 * y orderShortId del join orders(short_id).
 */
export const AdminAppealDtoSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    orderShortId: z.string().nullable(),
    businessId: z.string().uuid(),
    customerUserId: z.string().uuid(),
    customerPhone: z.string().nullable(),
    customerName: z.string().nullable(),
    description: z.string().nullable(),
    evidenceUrl: z.string().nullable(),
    appealStatus: AppealStatusSchema,
    refundStatus: RefundStatusSchema.nullable(),
    refundProofPath: z.string().nullable(),
    refundAmount: z.number().positive().nullable(),
    refundCompletedAt: z.string().datetime().nullable(),
    appealDeadline: z.string().datetime().nullable(),
    resolvedBy: z.string().uuid().nullable(),
    resolvedAt: z.string().datetime().nullable(),
    resolutionNote: z.string().nullable(),
    createdBy: z.string().uuid().nullable(),
    type: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    // Campos enriquecidos del pedido y negocio
    orderCreatedAt: z.string().datetime().nullable(),
    businessName: z.string().nullable(),
    yapeNumber: z.string().nullable(),
    rejectionReasonCode: z.string().nullable(),
    rejectionReasonText: z.string().nullable(),
    proofAttempt: z.number().int().min(0).nullable(),
  })
  .strict()
export type AdminAppealDto = z.infer<typeof AdminAppealDtoSchema>

export const AppealListResponseSchema = z.object({
  items: z.array(AdminAppealDtoSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1).max(100),
})
export type AppealListResponse = z.infer<typeof AppealListResponseSchema>
