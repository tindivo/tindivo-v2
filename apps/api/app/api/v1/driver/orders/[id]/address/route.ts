import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { rpcError } from '@/lib/http/rpc-error'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  // La caja de San Jacinto también se valida aquí, no solo en la DB. Un pin
  // fuera de rango es casi siempre un fallo del cliente (fix por IP, mapa mal
  // centrado), y cortarlo en el borde evita gastar un viaje a la base para
  // recibir el mismo "no".
  lat: z.number().min(-9.2).max(-9.1),
  lng: z.number().min(-78.33).max(-78.23),
  /**
   * Precisión del sensor en metros, o `null` si el pin se arrastró a mano.
   *
   * NULL NO ES LO MISMO QUE CERO. Es la convención de la 0122: un número
   * significa "lo midió el GPS", NULL significa "lo puso una persona". El
   * legacy mandaba `accuracy: 0` al reconfirmar y destruyó la precisión de 49
   * filas; el RPC rechaza el 0 y el 999 por eso mismo.
   */
  accuracyM: z.number().positive().lt(1000).nullable().optional(),
  /** Mejora opcional de la referencia. Ausente = no se toca la que había. */
  reference: z.string().trim().min(5).max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * El motorizado guarda dónde está de verdad la casa (0147).
 *
 * SOLO PEDIDOS MANUALES, y solo el motorizado asignado: las dos cosas las
 * comprueba el RPC, que además valida que la fila del directorio a la que
 * apunta el pedido exista.
 *
 * NO LLEVA `Idempotency-Key`, a diferencia de las transiciones. La operación es
 * idempotente por naturaleza —escribir dos veces la misma coordenada deja el
 * mismo estado— y exigir la cabecera obligaría al motorizado a resolver un
 * conflicto de clave para reintentar un guardado que no cuesta nada repetir.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const { id } = await params
    const body = Schema.parse(await req.json())

    const service = createServiceClient()
    // El cast existe porque `database.types.ts` se genera contra el REMOTO y la
    // 0147 todavía no está pusheada allí, así que el tipo no conoce la función.
    // SE QUITA tras `supabase db push` + `pnpm db:types`.
    // OJO CON EL ORDEN AL DESPLEGAR: la base primero. Si este endpoint sale
    // antes que la migración, PostgREST no encuentra la función y la captura
    // falla — no tumba la entrega (va en su propio try/catch en la PWA), pero
    // el motorizado vería un error en cada intento.
    // biome-ignore lint/suspicious/noExplicitAny: la firma llega con `pnpm db:types` tras el push
    const { data, error } = await (service.rpc as any)('capture_delivery_address', {
      p_order_id: id,
      p_driver_user_id: user.id,
      p_lat: body.lat,
      p_lng: body.lng,
      // `?? null` explícito: `undefined` haría que PostgREST usara el DEFAULT
      // del parámetro, que es lo mismo, pero dejarlo escrito evita que un
      // cambio futuro del default cambie el significado en silencio.
      p_accuracy_m: body.accuracyM ?? null,
      p_reference: body.reference ?? null,
    })

    if (error) throw rpcError(error)

    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
