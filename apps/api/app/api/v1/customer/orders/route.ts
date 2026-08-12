import { CreateOrderRequestSchema, getOpenStatus } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { findCompletedReplay, withIdempotency } from '@/lib/http/idempotency'
import { handleError, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated, sendOrderValidation } from '@/lib/inngest/client'
import { isPhoneAllowed, PILOT_REJECTION_DETAIL } from '@/lib/pilot/gate'
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

    // Defensa en profundidad: verificar teléfono verificado
    const { data: profile } = await service
      .from('customer_profiles')
      .select('phone_verified_at, phone')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.phone_verified_at) {
      return problem('forbidden', {
        detail: 'Verifica tu número de WhatsApp antes de hacer un pedido.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Gate del piloto cerrado. Este es el enforcement de verdad: una cuenta ya
    // verificada nunca vuelve a pasar por send-code, así que sin esto el muro
    // solo detendría a las cuentas nuevas.
    //
    // Se enforcea `profile.phone` (E.164, lo escribió /customer/phone/verify tras
    // el OTP de Twilio) y NO `body.customerPhone`: ese último lo teclea el cliente
    // en el checkout y puede poner cualquier cosa, así que gatear sobre él sería
    // pedirle al candado que lo abra quien quiere entrar.
    // `isPhoneAllowed` le quita el `+51` para comparar contra `pilot_whitelist`.
    if (!(await isPhoneAllowed(service, profile.phone))) {
      return problem('forbidden', {
        detail: PILOT_REJECTION_DETAIL,
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Guardia de contraentrega: verificar elegibilidad si el pago es contraentrega
    if (body.paymentIntent === 'pending_cash' || body.paymentIntent === 'pending_yape') {
      // 1. Verificar historial
      const { count } = await service
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_user_id', user.id)
        .eq('status', 'delivered')

      if ((count ?? 0) < 1) {
        return problem('forbidden', {
          detail: 'Tu primer pedido debe ser con pago adelantado.',
          requestId,
          headers: corsHeaders(req),
        })
      }

      // 2. Verificar tope usando el prepay_threshold de app_settings
      const { data: thresholdSetting } = await service
        .from('app_settings')
        .select('value')
        .eq('key', 'prepay_threshold')
        .maybeSingle()
      const threshold = Number(thresholdSetting?.value ?? 80)

      const itemIds = body.items.map((i) => i.menuItemId)
      const modifierIds = body.items.flatMap((i) => i.modifiers || [])

      const { data: itemsData } = await service
        .from('menu_items')
        .select('id, base_price')
        .in('id', itemIds)

      const { data: modifiersData } =
        modifierIds.length > 0
          ? await service
              .from('menu_modifier_options')
              .select('id, additional_price')
              .in('id', modifierIds)
          : { data: [] }

      let calculatedSubtotal = 0
      for (const item of body.items) {
        const itemDb = itemsData?.find((db) => db.id === item.menuItemId)
        if (itemDb) {
          let itemUnitPrice = Number(itemDb.base_price)
          for (const modId of item.modifiers || []) {
            const modDb = modifiersData?.find((db) => db.id === modId)
            if (modDb) {
              itemUnitPrice += Number(modDb.additional_price)
            }
          }
          calculatedSubtotal += itemUnitPrice * item.quantity
        }
      }

      let deliveryFee = 0
      if (body.deliveryMethod === 'delivery') {
        const { data: bands } = await service
          .from('app_settings')
          .select('value')
          .eq('key', 'delivery_bands')
          .maybeSingle()
        deliveryFee = Number((bands?.value as { near?: number })?.near ?? 2.0)
      }

      const calculatedTotal = calculatedSubtotal + deliveryFee
      if (calculatedTotal > threshold) {
        return problem('forbidden', {
          detail: `Pedidos mayores a S/${threshold} requieren pago adelantado.`,
          requestId,
          headers: corsHeaders(req),
        })
      }
    }

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
          p_delivery_address: body.deliveryAddress ?? '',
          p_delivery_reference: body.deliveryReference ?? '',
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
          // El guard de pedido activo no puede dejar su propio rastro: el RAISE
          // revierte la transacción. Viaja en `details` y se registra aquí, contra
          // el pedido que bloqueó. Sirve para decidir con datos si hace falta un
          // "agregar a mi pedido": si salta tres veces al mes se deja así; si
          // salta veinte, se construye.
          const blocked = /^active_order_block:([^:]+):([^:]+):(.+)$/.exec(error.details ?? '')
          if (blocked?.[1] && blocked[2] && blocked[3]) {
            const [, blockingOrderId, blockingShortId, blockingStatus] = blocked
            await service
              .from('order_event_log')
              .insert({
                order_id: blockingOrderId,
                event_type: 'order.active_order_block',
                actor_role: 'cliente',
                actor_user_id: user.id,
                data: {
                  blockingShortId,
                  blockingStatus,
                  businessId: body.businessId,
                  attemptedPaymentIntent: body.paymentIntent,
                },
              })
              .then(undefined, () => {
                /* el registro es best-effort: nunca debe tapar el error real */
              })
          }
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
      const created = (result.body as { data?: { id?: string; status?: string; shortId?: string } })
        .data
      if (created?.id) {
        try {
          // Agenda el timer según el estado: validación para contraentrega con strike (5m) · aceptación (5m).
          // El pago prepago se realiza en tracking tras la aceptación del negocio.
          if (created.status === 'validando') await sendOrderValidation({ orderId: created.id })
          else await sendOrderCreated({ orderId: created.id })
          // El aviso al negocio NO se manda desde aquí. Salía por Inngest
          // (`order/notify-business`), o sea por un segundo camino de push con
          // su propia pareja VAPID y este mismo `catch {}` tragándose los
          // fallos: si no llegaba, no quedaba rastro en ningún sitio. Desde la
          // 0136 lo emite send-push al recibir `OrderCreated` del outbox, que es
          // transaccional con el pedido y deja fila en `push_delivery_log`.
        } catch {
          // Solo quedan los temporizadores. El pedido ya está creado y el
          // negocio lo ve igual.
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
