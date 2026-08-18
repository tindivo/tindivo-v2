import { CreateOrderRequestSchema, getOpenStatus } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { sha256Hex } from '@/lib/http/hash'
import { findCompletedReplay, withIdempotency } from '@/lib/http/idempotency'
import { handleError, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { sendOrderCreated, sendOrderValidation } from '@/lib/inngest/client'
import { hasConfirmedOpening } from '@/lib/opening/service-day'
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

    // Guardia de contraentrega: verificar elegibilidad si el pago es contraentrega
    if (body.paymentIntent === 'pending_cash' || body.paymentIntent === 'pending_yape') {
      // 1. Verificar historial — DELEGADO, no reimplementado.
      //
      // Aquí vivía una TERCERA copia de la regla: `count` de pedidos
      // `delivered` de esta cuenta. Cuando la 0171 amplió qué cuenta como
      // historial —las entregas del teléfono verificado, incluidas las de los
      // pedidos que tomó la cajera, y las del v1 en el directorio—, esta copia
      // se quedó con el criterio viejo y rechazaba con 403 pedidos que la RPC
      // sí aceptaba. El vecino conocido veía la contraentrega en pantalla y se
      // estrellaba al confirmar.
      //
      // "Defensa en profundidad" no puede significar reimplementar la regla:
      // significa volver a preguntarla. Ahora las dos capas llaman al mismo
      // predicado, así que no pueden divergir otra vez.
      const { data: confiable, error: confiableError } = await service.rpc(
        'customer_trusted_for_contraentrega',
        { p_customer_user_id: user.id },
      )

      if (confiableError || confiable !== true) {
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

    // Negocio inactivo, bloqueado o inexistente: no recibe pedidos.
    const { data: biz } = await service
      .from('businesses')
      .select('accepting_orders_until,accepts_web_delivery,accepts_web_pickup,is_active,is_blocked')
      .eq('id', body.businessId)
      .maybeSingle()

    if (!biz || !biz.is_active || biz.is_blocked) {
      return problem('conflict', {
        detail: 'Este restaurante no está disponible para recibir pedidos.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    if (isBusinessPaused(biz.accepting_orders_until ?? null)) {
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

    // Apertura del día: estar dentro del horario no basta, alguien del negocio
    // tiene que haber confirmado que hoy atienden. Es lo que evita que entren
    // pedidos a un local que ese día no abrió.
    //
    // `null` = no se pudo consultar. En ese caso se deja pasar a propósito: un
    // fallo transitorio de la base no puede dejar al negocio sin vender, y el
    // pedido sin aceptar expira solo a los 15 minutos.
    const openingConfirmed = await hasConfirmedOpening(service, body.businessId)
    if (openingConfirmed === false) {
      return problem('conflict', {
        detail: 'El restaurante todavía no ha confirmado que atiende hoy. Inténtalo más tarde.',
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
