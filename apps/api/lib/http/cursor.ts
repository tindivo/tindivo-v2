import { DomainError } from '@tindivo/core'

/**
 * Cursor de paginación por KEYSET sobre `(created_at desc, id desc)`.
 *
 * Opaco para la app (base64url de un JSON): no lo arma ni lo interpreta. Un
 * cursor alterado o de otra lista responde 422, nunca una página equivocada.
 * Keyset y no OFFSET: un pedido nuevo entre dos páginas no repite ni salta filas.
 */
export interface KeysetCursor {
  createdAt: string
  id: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(JSON.stringify([c.createdAt, c.id])).toString('base64url')
}

export function decodeCursor(raw: string): KeysetCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [createdAt, id] = parsed
      if (
        typeof createdAt === 'string' &&
        typeof id === 'string' &&
        UUID.test(id) &&
        Number.isFinite(Date.parse(createdAt))
      ) {
        return { createdAt, id }
      }
    }
  } catch {
    // cae al error de abajo
  }
  throw new DomainError('cursor_invalid', 'validation_error')
}

/** Filtro PostgREST: filas estrictamente DESPUÉS del cursor en `created_at desc, id desc`. */
export function keysetFilter(c: KeysetCursor): string {
  const t = `"${c.createdAt}"`
  return `created_at.lt.${t},and(created_at.eq.${t},id.lt.${c.id})`
}
