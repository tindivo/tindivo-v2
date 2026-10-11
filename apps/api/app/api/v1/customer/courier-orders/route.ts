import { CreateCourierOrderRequestSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { listCustomerCourierOrders } from '@/lib/customer/courier-history'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { createIdempotently, findStoredCreation, isIdempotencyKey } from '@/lib/http/idempotency'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendCourierOrderCreated } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Mensajes legibles para los prefijos que `create_courier_order` (0232) puede
 * lanzar. La RPC es la única autoridad sobre la regla; esto solo traduce su
 * texto al mensaje que ve el cliente en `Pedir-5-estados.dc.html`.
 */
function courierErrorDetail(message: string): {
  code: 'conflict' | 'validation_error'
  detail: string
} {
  if (message.startsWith('courier_disabled')) {
    return { code: 'conflict', detail: 'Tindivo Entregas no está disponible ahora.' }
  }
  if (message.startsWith('courier_closed')) {
    return { code: 'conflict', detail: 'Atendemos de 6 a 11 pm, todos los días.' }
  }
  if (message.startsWith('courier_out_of_zone')) {
    return { code: 'conflict', detail: 'Solo llegamos dentro de San Jacinto.' }
  }
  if (message.startsWith('courier_active_limit')) {
    return { code: 'conflict', detail: 'Ya tienes una entrega en curso.' }
  }
  return { code: 'validation_error', detail: 'No pudimos crear tu solicitud. Intenta de nuevo.' }
}

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Historial de Entregas de la cliente de la sesión y sus contactos frecuentes, paginado por cursor. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    return ok(await listCustomerCourierOrders(token, user.id, req), {
      headers: privateHeaders(req),
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Crea una solicitud de Tindivo Entregas. Requiere sesión de cliente + Idempotency-Key. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const idempotencyKey = req.headers.get('idempotency-key')
    if (!idempotencyKey) {
      return problem('validation_error', {
        detail: 'Falta el header Idempotency-Key',
        requestId,
        headers: corsHeaders(req),
      })
    }

    if (!isIdempotencyKey(idempotencyKey)) {
      return problem('validation_error', {
        detail: 'Idempotency-Key debe ser un UUID',
        requestId,
        headers: corsHeaders(req),
      })
    }

    const { user } = await requireRole(req, 'customer')
    const body = CreateCourierOrderRequestSchema.parse(await req.json())
    const requestHash = await sha256Hex(JSON.stringify(body))
    const service = createServiceClient()

    // Replay temprano, aislado por usuario: un reintento de una solicitud ya
    // creada devuelve la original aunque el estado del servicio haya cambiado.
    const stored = await findStoredCreation(service, {
      userId: user.id,
      scope: 'create_courier_order',
      key: idempotencyKey,
      requestHash,
    })
    if (stored && 'conflict' in stored) {
      throw new DomainError(
        'Idempotency-Key reutilizada con un payload distinto',
        'idempotency_conflict',
      )
    }
    if (stored && 'inFlight' in stored) {
      throw new DomainError('Solicitud idéntica en proceso; reintenta en un momento', 'conflict')
    }
    if (stored) {
      return Response.json(stored.body, {
        status: 201,
        headers: { ...corsHeaders(req), 'idempotency-replayed': 'true' },
      })
    }

    // La solicitud y su clave se guardan en UNA transacción (0251): si el
    // proceso cae después del commit, el reintento recupera la solicitud.
    const result = await (async () => {
      const { data, error } = await createIdempotently(service, {
        userId: user.id,
        scope: 'create_courier_order',
        key: idempotencyKey,
        requestHash,
        args: {
          p_customer_user_id: user.id,
          p_requester_name: body.requesterName,
          p_requester_phone: body.requesterPhone,
          p_directory_business_id: body.directoryBusinessId ?? null,
          p_origin_name: body.origin.contactName,
          p_origin_phone: body.origin.contactPhone ?? null,
          p_origin_lat: body.origin.coordinates.lat,
          p_origin_lng: body.origin.coordinates.lng,
          p_origin_reference_text: body.origin.referenceText,
          p_destination_name: body.destination.contactName,
          p_destination_phone: body.destination.contactPhone ?? null,
          p_destination_lat: body.destination.coordinates.lat,
          p_destination_lng: body.destination.coordinates.lng,
          p_destination_reference_text: body.destination.referenceText,
          p_item_description: body.itemDescription,
          p_is_fragile: body.isFragile,
          p_ready_in_min: body.readyInMin,
          p_payer: body.payer,
          p_weight_confirmed: body.weightConfirmed,
          p_prepaid_confirmed: body.prepaidConfirmed,
          p_utm_source: body.utmSource,
          p_driver_note: body.driverNote,
        },
      })
      if (error) {
        if (error.code === 'IK409') {
          throw new DomainError(
            'Idempotency-Key reutilizada con un payload distinto',
            'idempotency_conflict',
          )
        }
        if (error.code === 'P0001') {
          const { code, detail } = courierErrorDetail(error.message)
          throw new DomainError(detail, code)
        }
        throw new Error(error.message)
      }
      return {
        status: 201,
        body: { data: data?.data },
        replayed: data?.replayed === true,
      }
    })()

    // Agenda el timeout de aceptación SOLO en creación real (no en replay).
    // Best-effort: un fallo de Inngest nunca debe romper la creación.
    if (!result.replayed) {
      const created = (result.body as { data?: { id?: string } }).data
      if (created?.id) {
        try {
          await sendCourierOrderCreated({ courierOrderId: created.id })
        } catch {
          // Solo queda el failsafe del cron (`expire_courier_orders`).
        }
      }
    }

    return Response.json(result.body, {
      status: result.status,
      headers: { ...corsHeaders(req), 'idempotency-replayed': String(result.replayed) },
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
