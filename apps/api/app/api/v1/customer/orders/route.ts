import { CreateOrderRequestSchema, getOpenStatus } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { findCompletedReplay, withIdempotency } from '@/lib/http/idempotency'
import { handleError, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated, sendOrderPrepay, sendOrderValidation } from '@/lib/inngest/client'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/** Modo ocupado: el negocio pausó (futuro o 'infinity'). */
function isBusinessPaused(until: string | null): boolean {
  if (!until) return false
  if (until === 'infinity') return true
  const t = Date.parse(until)
  return Number.isFinite(t) && t > Date.now()
}

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Crea un pedido del cliente. Requiere sesión de cliente + Idempotency-Key. */
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

    const { user } = await requireRole(req, 'customer')
    const body = CreateOrderRequestSchema.parse(await req.json())
    const requestHash = await sha256Hex(JSON.stringify(body))
    const service = createServiceClient()

    // Replay temprano: si esta Idempotency-Key ya completó, devuelve la respuesta
    // original ANTES de los guards de pausa/capacidades/horario — el estado del
    // negocio pudo cambiar entre el intento original y el retry (p. ej. cerró a
    // las 23:00) y un retry de un pedido YA creado debe ver su 201 original.
    const cached = await findCompletedReplay(service, {
      key: idempotencyKey,
      scope: 'create_order',
      requestHash,
    })
    if (cached) {
      return Response.json(cached.body, {
        status: cached.status,
        headers: { ...corsHeaders(req), 'idempotency-replayed': 'true' },
      })
    }

    // Busy mode: si el negocio está pausado, no aceptamos pedidos web nuevos.
    const { data: biz } = await service
      .from('businesses')
      .select('accepting_orders_until,accepts_web_delivery,accepts_web_pickup')
      .eq('id', body.businessId)
      .maybeSingle()
    if (isBusinessPaused(biz?.accepting_orders_until ?? null)) {
      return problem('forbidden', {
        detail: 'El restaurante está pausado temporalmente. Vuelve a intentar en unos minutos.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Capacidades: un negocio en modo catálogo (WhatsApp) no recibe pedidos web.
    // Defensa en profundidad — el RPC create_customer_order no valida esto.
    if (body.deliveryMethod === 'delivery' && !biz?.accepts_web_delivery) {
      return problem('conflict', {
        detail: 'Este negocio no acepta pedidos con delivery. Pide por WhatsApp desde su página.',
        requestId,
        headers: corsHeaders(req),
      })
    }
    if (body.deliveryMethod === 'pickup' && !biz?.accepts_web_pickup) {
      return problem('conflict', {
        detail: 'Este negocio no acepta recojo en local.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Horario de atención: fuera de horario no se aceptan pedidos web.
    // Sin horario configurado = siempre abierto. Mensaje distinto al de pausa
    // (403 "pausado temporalmente" arriba): cerrado es 409 y menciona la apertura.
    const { data: scheduleRows } = await service
      .from('business_schedule')
      .select('day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end')
      .eq('business_id', body.businessId)
    const openStatus = getOpenStatus(scheduleRows ?? [], new Date())
    if (openStatus.kind === 'closed') {
      return problem('conflict', {
        detail:
          openStatus.opensToday && openStatus.opensAt
            ? `El restaurante está cerrado ahora. Abre hoy a las ${openStatus.opensAt}.`
            : 'El restaurante está cerrado ahora. Revisa su horario de atención.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    const result = await withIdempotency(
      service,
      { key: idempotencyKey, scope: 'create_order', userId: user.id, requestHash },
      async () => {
        const { data, error } = await service.rpc('create_customer_order', {
          p_customer_user_id: user.id,
          p_business_id: body.businessId,
          p_delivery_method: body.deliveryMethod,
          p_payment_intent: body.paymentIntent,
          p_customer_name: body.customerName,
          p_customer_phone: body.customerPhone,
          p_delivery_address: body.deliveryAddress ?? undefined,
          p_delivery_reference: body.deliveryReference ?? undefined,
          p_delivery_lat: body.coordinates?.lat ?? undefined,
          p_delivery_lng: body.coordinates?.lng ?? undefined,
          p_items: body.items.map((i) => ({
            menu_item_id: i.menuItemId,
            quantity: i.quantity,
            note: i.note ?? null,
            modifiers: i.modifiers ?? [],
          })),
          p_source: 'customer_pwa',
          // Only meaningful for cash on delivery (the RPC also guards by intent).
          p_client_pays_with:
            body.paymentIntent === 'pending_cash' ? (body.cashPayingWith ?? undefined) : undefined,
          p_customer_gps_lat: body.gpsValidation?.lat,
          p_customer_gps_lng: body.gpsValidation?.lng,
          p_customer_gps_accuracy_m: body.gpsValidation?.accuracyM,
          p_customer_gps_distance_to_center_km: body.gpsValidation?.distanceToCenterKm,
          p_customer_gps_method: body.gpsValidation?.method,
        })
        if (error) {
          if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
          if (error.code === 'P0001') throw new DomainError(error.message, 'validation_error')
          throw new Error(error.message)
        }
        return { status: 201, body: { data } }
      },
    )

    // Agenda el timeout de aceptación SOLO en creación real (no en replay).
    // Best-effort: un fallo de Inngest nunca debe romper la creación del pedido.
    if (!result.replayed) {
      const created = (result.body as { data?: { id?: string; status?: string } }).data
      if (created?.id) {
        try {
          // Agenda el timer según el estado/método: prepago (10m) · validación (5m) · aceptación (5m).
          if (created.status === 'validando' && body.paymentIntent === 'prepaid')
            await sendOrderPrepay({ orderId: created.id })
          else if (created.status === 'validando')
            await sendOrderValidation({ orderId: created.id })
          else await sendOrderCreated({ orderId: created.id })
        } catch {
          // El pedido ya está creado; el negocio lo ve igual. (TODO: dispatch vía outbox.)
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
