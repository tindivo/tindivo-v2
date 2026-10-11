import { UuidSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { handleOptions } from '@/lib/http/cors'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  ORDER_DETAIL_COLUMNS,
  type OrderDetailRow,
  toOrderDetailDto,
} from '@/lib/mappers/customer-orders'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /customer/orders/{id}: un pedido PROPIO, completo.
 *
 * El pedido se lee con la sesión del cliente: la policy `ord_customer_read` solo
 * deja ver los suyos, así que uno ajeno es un 404 idéntico al de un id
 * inventado (no confirma que exista). El negocio y el motorizado no son legibles
 * por el cliente por RLS: se leen con el servicio SOLO después de que el pedido
 * ya demostró ser suyo. El teléfono del motorizado sigue la regla del
 * seguimiento público: solo cuando ya llegó a la puerta.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'customer')
    const id = UuidSchema.parse((await params).id)

    const { data, error } = await createUserClient(token)
      .from('orders')
      .select(ORDER_DETAIL_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Ese pedido no existe', 'not_found')
    const row = data as unknown as OrderDetailRow

    const service = createServiceClient()
    const [{ data: biz }, { data: drv }] = await Promise.all([
      service.from('businesses').select('name').eq('id', row.business_id).maybeSingle(),
      row.driver_id
        ? service.from('drivers').select('full_name,phone').eq('id', row.driver_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    return ok(
      toOrderDetailDto(
        row,
        biz?.name ?? null,
        drv ? { name: drv.full_name, phone: drv.phone } : null,
      ),
      { headers: privateHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
