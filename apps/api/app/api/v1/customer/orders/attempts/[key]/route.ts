import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import {
  CreationRecordReadError,
  isIdempotencyKey,
  readCreationRecord,
} from '@/lib/http/idempotency'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reconcilia un intento de creación: ¿esta `Idempotency-Key` ya creó un pedido
 * de este cliente? Sirve cuando se perdió la respuesta del POST (red, 5xx,
 * proceso muerto) y la app no sabe si el pedido existe. `creation_idempotency`
 * se escribe en la MISMA transacción que el pedido (0251): una fila vigente
 * prueba que existe, y su ausencia prueba que esa clave aún no creó nada.
 *
 * Todo se filtra por el usuario del token: la clave de otro cliente es
 * indistinguible de una que no existe. Solo restaurantes (`create_order`).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { key } = await params
    if (!isIdempotencyKey(key)) {
      return problem('validation_error', {
        detail: 'La clave del intento debe ser un UUID',
        requestId,
        headers: corsHeaders(req),
      })
    }
    const service = createServiceClient()
    const headers = privateHeaders(req)
    let record: Awaited<ReturnType<typeof readCreationRecord>>
    try {
      record = await readCreationRecord(service, {
        userId: user.id,
        scope: 'create_order',
        key,
      })
    } catch (err) {
      // No se pudo leer el registro: no se sabe si el pedido existe. Nunca `not_found`.
      if (err instanceof CreationRecordReadError) {
        return ok({ state: 'unknown', order: null }, { headers })
      }
      throw err
    }
    if (!record) return ok({ state: 'not_found', order: null }, { headers })
    if (record.state === 'reserved') return ok({ state: 'unknown', order: null }, { headers })
    // Legada `completed` con respuesta de error: la clave está consumida pero el pedido no
    // se creó (o no se sabe). La tabla nueva no tiene `responseStatus` y siempre prueba creación.
    if (
      record.responseStatus !== undefined &&
      !(
        record.responseStatus !== null &&
        record.responseStatus >= 200 &&
        record.responseStatus <= 299
      )
    ) {
      return ok({ state: 'unknown', order: null }, { headers })
    }

    const saved = (record.response ?? {}) as { id?: unknown; shortId?: unknown }
    let id = typeof saved.id === 'string' ? saved.id : (record.resourceId ?? null)
    let shortId = typeof saved.shortId === 'string' ? saved.shortId : null
    if (id && !UUID_RE.test(id)) id = null
    if (id && !shortId) {
      // La respuesta guardada no trae el código corto: se lee del pedido, siempre del cliente.
      const { data: order } = await service
        .from('orders')
        .select('id,short_id')
        .eq('id', id)
        .eq('customer_user_id', user.id)
        .maybeSingle()
      if (order) {
        id = order.id
        shortId = order.short_id
      } else {
        id = null
      }
    }
    return ok({ state: 'created', order: id && shortId ? { id, shortId } : null }, { headers })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
