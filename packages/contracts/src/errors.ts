import { z } from 'zod'

/**
 * Catálogo estable de códigos de error de negocio. Los clientes pueden ramificar
 * lógica sobre `code` (a diferencia de `status` HTTP, que es más grueso).
 */
export const API_ERROR_CODES = [
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'idempotency_conflict',
  'rate_limited',
  'invalid_state_transition',
  'business_blocked',
  'order_not_cancellable',
  'payment_required',
  'internal_error',
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** Mapa de código de negocio -> status HTTP por defecto. */
export const ERROR_CODE_STATUS: Record<ApiErrorCode, number> = {
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  invalid_state_transition: 409,
  business_blocked: 403,
  order_not_cancellable: 409,
  payment_required: 402,
  internal_error: 500,
}

/** Detalle de un error de validación por campo. */
export const ValidationIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
})
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

/**
 * RFC 9457 Problem Details + extensiones Tindivo (`code`, `requestId`, `errors`).
 * Respuesta de error canónica de toda la API (`content-type: application/problem+json`).
 */
export const ProblemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(API_ERROR_CODES),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(ValidationIssueSchema).optional(),
})
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>
