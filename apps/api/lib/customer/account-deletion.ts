/**
 * Lo que `delete_customer_account` (0259) le dice a la API, traducido a lo que la
 * ruta responde. Pura: sin base, para poder probarla sola.
 *
 * Una respuesta que no se reconoce LANZA en vez de contar como borrada: decirle
 * a alguien «tu cuenta ya no existe» cuando sí existe es peor que un error.
 */
export type DeletionOutcome = { kind: 'done' } | { kind: 'blocked'; detail: string }

const BLOCKED_DETAIL: Record<string, string> = {
  active_orders:
    'Tienes un pedido en curso. Cuando termine o lo canceles, podrás borrar tu cuenta.',
  open_money_reports:
    'Tienes una apelación o una devolución sin resolver. Cuando se cierre, podrás borrar tu cuenta.',
  other_roles:
    'Esta cuenta también es de negocio, motorizado o administración. Escribe a soporte para cerrarla.',
}

export function parseDeletionResult(result: unknown): DeletionOutcome {
  const r = (result ?? {}) as { status?: unknown; reason?: unknown }
  if (r.status === 'deleted' || r.status === 'already_deleted') return { kind: 'done' }
  if (r.status === 'blocked' && typeof r.reason === 'string' && r.reason in BLOCKED_DETAIL) {
    return { kind: 'blocked', detail: BLOCKED_DETAIL[r.reason] as string }
  }
  throw new Error(`delete_customer_account devolvió algo inesperado: ${JSON.stringify(result)}`)
}
