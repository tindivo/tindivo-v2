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

/**
 * SQLSTATE que PostgreSQL devuelve cuando aborta una transacción por una carrera sin
 * corromper nada: `40P01` (deadlock detectado) y `40001` (fallo de serialización).
 * Reintentar la MISMA transacción es lo correcto. El borrado de cuenta puede cruzarse
 * con un UPDATE directo del perfil o de la libreta (ver 0259, «LA CARRERA»).
 */
const RETRYABLE_SQLSTATE = new Set(['40P01', '40001'])

export function isRetryableTxError(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && RETRYABLE_SQLSTATE.has(error.code)
}

/** 3 intentos en total, con una espera corta y creciente (con algo de azar para no chocar de nuevo). */
export async function withTxRetry<T extends { error: { code?: string | null } | null }>(
  run: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const base = options.baseDelayMs ?? 80
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let result = await run()
  for (let n = 1; n < attempts && isRetryableTxError(result.error); n++) {
    await sleep(base * 2 ** (n - 1) + Math.floor(Math.random() * base))
    result = await run()
  }
  return result
}
