import { z } from 'zod'
import { PAYMENT_PROOF_STATUSES } from './enums'

/**
 * Pago único del cliente de confianza (0296): lo que el negocio y el motorizado
 * mandan y reciben cuando el cliente paga con «Yape o Plin» un pedido con entrega
 * (`payment_intent = 'pending_yape'`). La captura es opcional y NO frena al pedido;
 * solo el negocio confirma el ingreso.
 */

/** Motivos con los que el negocio rechaza una captura (la lista de `reject_delivery_payment_proof`). */
export const DELIVERY_PAYMENT_REJECT_REASONS = [
  'invalid_proof',
  'wrong_amount',
  'unreadable',
  'other',
] as const
export type DeliveryPaymentRejectReason = (typeof DELIVERY_PAYMENT_REJECT_REASONS)[number]

/** POST /business/orders/{id}/payment-proof/reject */
export const DeliveryPaymentRejectRequestSchema = z.object({
  attempt: z.number().int().min(1).max(2).meta({
    description: 'El intento de captura que el negocio estaba mirando; si ya hay otro, se rechaza',
  }),
  reasonCode: z.enum(DELIVERY_PAYMENT_REJECT_REASONS),
})

const ProofStatusOut = z.enum(PAYMENT_PROOF_STATUSES)

/** POST /business/orders/{id}/payment-confirmation */
export const DeliveryPaymentConfirmationSchema = z.object({
  id: z.string(),
  status: z.string(),
  paymentProofStatus: ProofStatusOut,
  paymentVerifiedAt: z.string().meta({ description: 'Instante en UTC (ISO 8601 con `Z`)' }),
})
export type DeliveryPaymentConfirmation = z.infer<typeof DeliveryPaymentConfirmationSchema>

/** POST /business/orders/{id}/payment-proof/reject */
export const DeliveryPaymentRejectionSchema = z.object({
  id: z.string(),
  status: z.string(),
  paymentProofStatus: ProofStatusOut,
  attempt: z.number().int(),
  attemptsLeft: z.number().int().meta({ description: 'Intentos que le quedan al cliente' }),
})
export type DeliveryPaymentRejection = z.infer<typeof DeliveryPaymentRejectionSchema>

/** GET /driver/orders/{id}/prepay-proof */
export const DriverPaymentProofSchema = z.object({
  url: z.string().meta({ description: 'URL firmada de lectura; caduca en `expiresInSeconds`' }),
  expiresInSeconds: z.number().int(),
  paymentProofStatus: ProofStatusOut,
})
export type DriverPaymentProof = z.infer<typeof DriverPaymentProofSchema>
