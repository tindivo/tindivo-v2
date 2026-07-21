import { DomainError } from '@tindivo/core'

/**
 * Mensajes conocidos de P0001 que mapean a 409 Conflict (estado incompatible).
 * Las RPC usan P0001 (raise_exception) para múltiples situaciones;
 * clasificamos por mensaje conocido para devolver el HTTP correcto.
 */
const CONFLICT_PATTERNS = [
  /ya (ha sido|fue) (resuelta|devuelto|revisad[oa])/i,
  /already (resolved|refunded|reviewed)/i,
  /not in .* status/i,
  /cannot \w+ because/i,
]

/** Mensajes conocidos de P0001 que mapean a 422 (validación). */
const VALIDATION_PATTERNS = [
  /amount.*(exceeds|incorrecto|superior|must)/i,
  /monto/i,
  /deadline.*expired/i,
  /plazo.*vencido/i,
  /invalid/i,
]

/**
 * Convierte errores de Supabase/RPC a DomainError con el código HTTP adecuado.
 *
 * - P0002 → 404 not_found
 * - P0001 → 409 conflict o 422 validation_error según el mensaje
 * - 42501 → 403 forbidden
 * - Otros → 500 (genérico)
 *
 * Uso:
 *   const { data, error } = await client.rpc('resolve_appeal', params)
 *   if (error) throwRpcError(error)
 */
export function throwRpcError(error: {
  code: string
  message: string
}): never {
  // P0002: recurso no encontrado → 404
  if (error.code === 'P0002') {
    throw new DomainError(error.message, 'not_found')
  }

  // P0001: clasificar según mensaje conocido
  if (error.code === 'P0001') {
    if (CONFLICT_PATTERNS.some((p) => p.test(error.message))) {
      throw new DomainError(error.message, 'conflict')
    }
    if (VALIDATION_PATTERNS.some((p) => p.test(error.message))) {
      throw new DomainError(error.message, 'validation_error')
    }
    // Fallback seguro: 422 para P0001 desconocidos
    throw new DomainError(error.message, 'validation_error')
  }

  // 42501: permisos insuficientes → 403
  if (error.code === '42501') {
    throw new DomainError(error.message, 'forbidden')
  }

  // Cualquier otro código: 500
  throw new Error(error.message)
}

/**
 * @deprecated Usar `throwRpcError` (nombre canónico).
 * Alias mantenido para compatibilidad con código existente.
 */
export const rpcError = throwRpcError
