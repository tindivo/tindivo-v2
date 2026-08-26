import { DomainError } from '@tindivo/core'
import { z } from 'zod'
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
 * Payload COMPLETO, no parcial: la RPC recibe siempre todos los campos
 * editables. Es lo que impide que dos ediciones casi simultáneas dejen una fila
 * con el total de una y el método de pago de otra.
 *
 * `expectedUpdatedAt` es el testigo de versión: el `updated_at` que la cajera
 * tenía delante al abrir el formulario.
 */
const Schema = z.object({
  expectedUpdatedAt: z.string().min(1),
  totalAmount: z.number().positive(),
  paymentIntent: z.enum(['pending_cash', 'pending_yape', 'pending_mixed', 'prepaid']),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  deliveryReference: z.string().nullable().optional(),
  clientPaysWith: z.number().nullable().optional(),
  yapeAmount: z.number().nullable().optional(),
  cashAmount: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
})

/** Lo que la UI necesita para repintar el formulario tras un conflicto. */
const CAMPOS_FRESCOS =
  'id,short_id,status,order_amount,delivery_fee,payment_intent,client_pays_with,yape_amount,cash_amount,change_to_give,customer_name,customer_phone,delivery_reference,delivery_method,driver_id,updated_at'

/**
 * La cajera corrige un pedido que acaba de tomar (0190).
 *
 * Dinero hasta `waiting_at_restaurant` (excluido: ahí ya le dio el sencillo al
 * motorizado), contacto hasta `picked_up`. Los guards viven en la RPC, no aquí:
 * una pestaña abierta hace diez minutos no puede saltárselos.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const service = createServiceClient()

    const { data, error } = await service.rpc('update_business_manual_order', {
      p_order_id: id,
      p_business_user_id: user.id,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_total_amount: body.totalAmount,
      p_payment_intent: body.paymentIntent,
      // `undefined` y no `null`: los parámetros con DEFAULT NULL se tipan como
      // opcionales, y omitirlos aplica ese mismo NULL. El resultado en la base
      // es idéntico; lo que cambia es que TypeScript lo acepta.
      p_customer_name: body.customerName ?? undefined,
      p_customer_phone: body.customerPhone ?? undefined,
      p_delivery_reference: body.deliveryReference ?? undefined,
      p_client_pays_with: body.clientPaysWith ?? undefined,
      p_yape_amount: body.yapeAmount ?? undefined,
      p_cash_amount: body.cashAmount ?? undefined,
      p_reason: body.reason ?? undefined,
    })

    if (error) {
      // ── El conflicto de versión viaja CON los datos frescos ───────────────
      //
      // Es la diferencia entre «recarga y vuelve a escribirlo todo» y «mira qué
      // cambió y decide». Si la UI tuviera que pedir el pedido otra vez, entre
      // las dos llamadas cabe una tercera edición y el aviso ya mentiría.
      //
      // Se arma a mano en vez de con `problem()` porque ese helper solo emite el
      // sobre RFC 9457 y aquí hace falta un campo más. Se respeta su forma —
      // mismo `content-type`, mismos campos— y se le añade `current`.
      if (error.code === 'P0001' && (error.details ?? '').includes('stale_order_edit:')) {
        const { data: fresco } = await service
          .from('orders')
          .select(CAMPOS_FRESCOS)
          .eq('id', id)
          .maybeSingle()

        return Response.json(
          {
            type: 'about:blank',
            title: 'conflict',
            status: 409,
            code: 'conflict',
            detail: 'El pedido cambió mientras lo editabas.',
            requestId,
            current: fresco ?? null,
          },
          {
            status: 409,
            headers: {
              'content-type': 'application/problem+json',
              ...corsHeaders(req),
            },
          },
        )
      }

      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'invalid_state_transition')
      throw new Error(error.message)
    }

    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
