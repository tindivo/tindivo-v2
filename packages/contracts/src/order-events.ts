import { z } from 'zod'

/**
 * Schemas para el campo `data` (jsonb) de `order_event_log`.
 *
 * Todos usan `.partial().passthrough()` para tolerar:
 * 1. Eventos legados con `data: {}` (campos ausentes en registros viejos).
 * 2. Nuevos campos agregados en el futuro sin romper el parser actual.
 *
 * Los schemas son opcionales — cada consumer decide si validar o usar el tipo
 * crudo `Record<string, unknown>`. Están aquí como referencia canónica y para
 * usar en tests y en el frontend admin.
 */

// ── order.prepay_proof_uploaded ─────────────────────────────────────────────

export const PrepayProofUploadedData = z
  .object({
    proof_path: z.string(),
    attempt: z.number().int().positive(),
  })
  .partial()
  .passthrough()

// ── order.validation_failed_retry ───────────────────────────────────────────

export const ValidationFailedRetryData = z
  .object({
    reason: z.string(),
    reasonCode: z.string(),
    attempt: z.number().int().positive(),
    proof_path: z.string(),
  })
  .partial()
  .passthrough()

// ── order.validation_failed ─────────────────────────────────────────────────

export const ValidationFailedData = z
  .object({
    reason: z.string(),
    reasonCode: z.string(),
    proof_path: z.string(),
  })
  .partial()
  .passthrough()

// ── order.appeal_created ────────────────────────────────────────────────────

export const AppealCreatedData = z
  .object({
    reportId: z.string().uuid(),
    evidence_url: z.string(),
    description: z.string(),
  })
  .partial()
  .passthrough()

// ── order.refund_registered ─────────────────────────────────────────────────

export const RefundRegisteredData = z
  .object({
    reportId: z.string().uuid(),
    amount: z.number().positive(),
    proofPath: z.string(),
  })
  .partial()
  .passthrough()

// ── Mapa de event_type → schema (útil para parsers dinámicos) ───────────────

export const ORDER_EVENT_DATA_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'order.prepay_proof_uploaded': PrepayProofUploadedData,
  'order.validation_failed_retry': ValidationFailedRetryData,
  'order.validation_failed': ValidationFailedData,
  'order.appeal_created': AppealCreatedData,
  'order.refund_registered': RefundRegisteredData,
}

/**
 * Helper: extrae las claves de `data` que potencialmente contienen rutas de
 * archivos en Storage (proof_path, evidence_url, proofPath, etc.).
 * Útil para saber qué campos convertir a signed URLs.
 */
export function extractStoragePaths(
  data: Record<string, unknown> | null | undefined,
): string[] {
  if (!data) return []
  const paths: string[] = []
  const keys = ['proof_path', 'evidence_url', 'proofPath']
  for (const key of keys) {
    const val = data[key]
    if (typeof val === 'string' && val.length > 0) {
      paths.push(val)
    }
  }
  return paths
}
