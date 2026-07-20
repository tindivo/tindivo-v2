import { z } from 'zod'

export const AppealStatusSchema = z.enum(['pending', 'in_review', 'approved', 'rejected'])
export type AppealStatus = z.infer<typeof AppealStatusSchema>

export const RefundStatusSchema = z.enum(['pending', 'completed'])
export type RefundStatus = z.infer<typeof RefundStatusSchema>

export const CreateAppealSchema = z.object({
  description: z.string().trim().max(500).optional(),
})
export type CreateAppealPayload = z.infer<typeof CreateAppealSchema>

export const ResolveAppealSchema = z.object({
  resolution: z.enum(['favor_cliente', 'favor_restaurante']),
  note: z.string().trim().max(1000).optional(),
})
export type ResolveAppealPayload = z.infer<typeof ResolveAppealSchema>

export const RegisterRefundSchema = z.object({
  refundProofPath: z.string().trim().min(1, 'La ruta del comprobante es requerida'),
  amount: z.number().positive('El monto debe ser positivo'),
})
export type RegisterRefundPayload = z.infer<typeof RegisterRefundSchema>

/** DTO uniformizado en camelCase para reportes de apelación */
export interface AppealReportDto {
  id: string
  orderId: string
  businessId: string
  customerUserId: string
  customerPhone: string | null
  description: string | null
  evidenceUrl: string | null
  appealStatus: AppealStatus
  refundStatus: RefundStatus | null
  refundProofPath: string | null
  refundAmount: number | null
  refundCompletedAt: string | null
  appealDeadline: string
  status: string
  createdAt: string
  updatedAt: string
}
