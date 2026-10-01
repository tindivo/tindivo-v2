import { DriverCourierStepRequestSchema } from '@tindivo/contracts'
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

/**
 * Mensajes para los prefijos que lanza `driver_courier_step` (0235) y
 * `advance_courier_order` (0232). La RPC es la autoridad; esto solo traduce.
 */
const STEP_ERRORS: Record<
  string,
  { code: 'conflict' | 'not_found' | 'validation_error'; detail: string }
> = {
  courier_driver_full: {
    code: 'conflict',
    detail: 'Ya tienes el máximo de entregas. Termina una antes de aceptar otra.',
  },
  courier_already_taken: { code: 'conflict', detail: 'Otro motorizado ya tomó esta entrega.' },
  courier_payment_method_required: {
    code: 'validation_error',
    detail: 'Marca cómo te pagaron: Yape o efectivo.',
  },
  courier_release_after_collect: {
    code: 'conflict',
    detail: 'Ya cobraste esta entrega: no se puede soltar. Llama a Jesús.',
  },
  courier_cannot_release: { code: 'conflict', detail: 'Esta entrega ya no se puede soltar.' },
  courier_cancel_reason_required: { code: 'validation_error', detail: 'Elige un motivo.' },
  courier_invalid_transition: {
    code: 'conflict',
    detail: 'Esta entrega cambió de estado. Actualiza la pantalla.',
  },
  courier_not_found: { code: 'not_found', detail: 'No encontramos esa entrega.' },
  courier_driver_not_found: { code: 'not_found', detail: 'Motorizado no encontrado.' },
}

/** Un botón del motorizado: accept · pick_up · deliver · fail · release. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'driver')
    const { id } = await params
    const body = DriverCourierStepRequestSchema.parse(await req.json())
    const service = createServiceClient()

    const { data, error } = await service.rpc('driver_courier_step', {
      p_courier_order_id: id,
      p_actor_user_id: user.id,
      p_step: body.step,
      // Nullable sin DEFAULT útil: la RPC distingue null de «no enviado» igual,
      // pero el tipo generado no admite null (mismo caso que create_courier_order).
      p_payment_method: (body.paymentMethod ?? null) as unknown as string,
      p_cancel_reason: (body.failReason ?? null) as unknown as 'other',
    })
    if (error) {
      if (error.code === 'P0001') {
        const prefix = error.message.split(':')[0] ?? ''
        const known = STEP_ERRORS[prefix]
        if (known) throw new DomainError(known.detail, known.code)
        throw new DomainError('No se pudo completar. Intenta de nuevo.', 'conflict')
      }
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
