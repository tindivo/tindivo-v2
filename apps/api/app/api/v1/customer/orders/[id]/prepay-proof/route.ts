import { PrepayProofRequestSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El cliente registra la ruta del comprobante que subió a Storage (su carpeta). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { id } = await params
    const body = PrepayProofRequestSchema.parse(await req.json())
    // La ruta debe estar dentro de la carpeta del propio usuario (defensa adicional).
    if (!body.path.startsWith(`${user.id}/`)) {
      throw new DomainError('Ruta de comprobante inválida', 'forbidden')
    }
    const service = createServiceClient()
    // Todo en UNA transacción (0248): dueño, estado, intentos, comprobante, rastro
    // y evento del outbox. El FOR UPDATE de la RPC serializa contra el cron de
    // vencimiento y contra otro comprobante, así que no hay lectura previa que
    // pueda quedar vieja (H-1) y el evento no se pierde (H-2).
    const { error } = await service.rpc('register_prepay_proof', {
      p_order_id: id,
      p_customer_user_id: user.id,
      p_path: body.path,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError('Pedido no encontrado', 'not_found')
      if (error.code === 'P0001') {
        if (error.hint === 'order_not_awaiting_proof')
          throw new DomainError(error.message, 'invalid_state_transition')
        // Ruta ajena o intentos agotados: lo mismo que respondía antes.
        throw new DomainError(error.message, 'forbidden')
      }
      throw new Error(error.message)
    }

    // Los avisos solo salen si el comprobante quedó registrado.
    try {
      const { sendOrderPrepayProofUploaded, sendOrderValidation } = await import(
        '@/lib/inngest/client'
      )
      await sendOrderPrepayProofUploaded({ orderId: id })
      await sendOrderValidation({ orderId: id })
    } catch {}

    return ok({ ok: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
