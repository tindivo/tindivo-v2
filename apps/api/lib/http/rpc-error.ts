import type { ApiErrorCode } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'

/** SQLSTATE de los RPC antifraude -> código de API (status HTTP). */
const SQLSTATE_TO_CODE: Record<string, ApiErrorCode> = {
  P0002: 'not_found', // raise ... 'no existe'
  '42501': 'forbidden', // pedido/recurso de otro dueño
  '22023': 'validation_error', // parámetro inválido
}

/**
 * Mapea el error de un RPC de Postgres a un `DomainError` con el código HTTP
 * adecuado. El rate-limit (P0001 con mensaje "Límite…") -> 429; el resto de
 * P0001 -> 409. `handleError` luego lo convierte a Problem Details.
 */
export function rpcError(error: { code?: string; message: string }): DomainError {
  if (error.code === 'P0001' && /l[ií]mite/i.test(error.message)) {
    return new DomainError(error.message, 'rate_limited')
  }
  const code = SQLSTATE_TO_CODE[error.code ?? ''] ?? 'conflict'
  return new DomainError(error.message, code)
}
