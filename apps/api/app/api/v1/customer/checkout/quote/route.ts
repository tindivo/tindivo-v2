import {
  cents,
  isMoneyNumber,
  MAX_MONEY,
  planQuotePayment,
  quoteDelivery,
} from '@tindivo/backend/ordering'
import {
  CheckoutQuoteRequestSchema,
  checkModifierSelection,
  modifierSelectionMessage,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { handleOptions } from '@/lib/http/cors'
import { privateHeaders } from '@/lib/http/private-response'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { toMoneyText } from '@/lib/mappers/money-text'
import { createServiceClient } from '@/lib/supabase/service'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

const text = (c: number): string => (c / 100).toFixed(2)

/**
 * POST /customer/checkout/quote: todo lo que el checkout pinta.
 *
 * NO DECIDE NADA NUEVO. Reúne, en una sola llamada, lo que la web pedía a la
 * base en cuatro viajes y calculaba en el navegador:
 *   · la banda del punto: `delivery_band_for_point` (la misma que usa
 *     `create_customer_order`) y el precio de `app_settings.delivery_bands`,
 *     con el mismo respaldo que la función (tarifa del negocio, luego S/ 2.00);
 *   · el envío gratis por promo de lanzamiento (`current_customer_promo_free_delivery`)
 *     o por plato (`cart_item_free_delivery`), en el mismo orden de la creación;
 *   · el vuelto máximo: `effective_max_change`;
 *   · el umbral de prepago de `app_settings`;
 *   · qué métodos de pago puede usar el cliente (`payment`, H-7): la regla vive
 *     en `planQuotePayment`; aquí solo se reúnen sus datos.
 * Los precios salen de `menu_items` y de las opciones de modificador, nunca del
 * cliente. Es solo para pintar: `create_customer_order` vuelve a decidir.
 *
 * Las funciones que responden por `auth.uid()` se llaman con la sesión del
 * cliente; la lectura de precios y ajustes, con el servicio (el cliente no lee
 * `app_settings` ni los precios de un negocio por RLS).
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const body = CheckoutQuoteRequestSchema.parse(await req.json())
    // Postgres compara UUID sin distinguir mayúsculas; normalizamos para las consultas y mapas.
    body.items = body.items.map((item) => ({
      ...item,
      menuItemId: item.menuItemId.toLowerCase(),
      modifiers: item.modifiers?.map((id) => id.toLowerCase()),
    }))
    const service = createServiceClient()
    const asUser = createUserClient(token)

    const { data: biz, error: bizErr } = await service
      .from('businesses')
      .select('id,is_active,is_blocked,delivery_fee')
      .eq('id', body.businessId)
      .maybeSingle()
    if (bizErr) throw new Error(bizErr.message)
    if (!biz) throw new DomainError('Este restaurante no existe', 'not_found')
    if (!biz.is_active || biz.is_blocked) {
      throw new DomainError('Este restaurante no está disponible para recibir pedidos.', 'conflict')
    }

    // ── Precios del carrito ──────────────────────────────────────────────────
    const itemIds = [...new Set(body.items.map((i) => i.menuItemId))]
    const modifierIds = [...new Set(body.items.flatMap((i) => i.modifiers ?? []))]
    const [{ data: dishes, error: dishErr }, { data: options, error: optErr }] = await Promise.all([
      service
        .from('menu_items')
        .select(
          'id,name,base_price,business_id,is_available,deleted_at,available_days,available_from,available_to',
        )
        .in('id', itemIds),
      modifierIds.length > 0
        ? service
            .from('menu_modifier_options')
            .select('id,additional_price,is_available,group_id')
            .in('id', modifierIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (dishErr) throw new Error(dishErr.message)
    if (optErr) throw new Error(optErr.message)

    // Incluye los grupos sin opciones elegidas para detectar los obligatorios.
    const { data: links, error: linkErr } = await service
      .from('menu_item_modifier_groups')
      .select(
        'item_id,group_id,group:menu_modifier_groups!inner(id,name,selection_type,is_required,min_selections,max_selections)',
      )
      .in('item_id', itemIds)
      .order('display_order')
      .order('group_id')
    if (linkErr) throw new Error(linkErr.message)
    const linked = new Set((links ?? []).map((l) => `${l.item_id}:${l.group_id}`))

    // Disponibilidad por franja: la misma función que aplica la creación del
    // pedido del cliente (`menu_item_orderable_now`).
    const orderable = new Map<string, boolean>()
    await Promise.all(
      (dishes ?? []).map(async (d) => {
        const { data, error } = await service.rpc('menu_item_orderable_now', {
          p_days: d.available_days as number[],
          p_from: d.available_from as string,
          p_to: d.available_to as string,
        })
        if (error) throw new Error(error.message)
        orderable.set(d.id, data === true)
      }),
    )

    const dishById = new Map((dishes ?? []).map((d) => [d.id, d]))
    const optionById = new Map((options ?? []).map((o) => [o.id, o]))
    const optionGroupOf = new Map((options ?? []).map((o) => [o.id, o.group_id]))

    let subtotalCents = 0
    const lines = body.items.map((line) => {
      const dish = dishById.get(line.menuItemId)
      if (!dish || dish.business_id !== body.businessId || !dish.is_available || dish.deleted_at) {
        throw new DomainError(
          'Hay platos de tu bolsa que ya no están disponibles.',
          'validation_error',
        )
      }
      if (orderable.get(dish.id) !== true) {
        throw new DomainError(`"${dish.name}" no se sirve en este turno.`, 'validation_error')
      }
      const groups = (links ?? []).filter((l) => l.item_id === dish.id).map((l) => l.group)
      const issue = checkModifierSelection(groups, line.modifiers ?? [], optionGroupOf)[0]
      // Mismo orden que la RPC: repetidas, opciones disponibles y vinculadas, reglas del grupo.
      if (issue?.kind === 'duplicate') {
        throw new DomainError(modifierSelectionMessage(issue, dish.name), 'validation_error')
      }
      let unitCents = cents(Number(dish.base_price))
      for (const optionId of line.modifiers ?? []) {
        const option = optionById.get(optionId)
        if (!option || !option.is_available || !linked.has(`${dish.id}:${option.group_id}`)) {
          throw new DomainError(
            'Hay opciones de tu bolsa que ya no están disponibles.',
            'validation_error',
          )
        }
        unitCents += cents(Number(option.additional_price))
      }
      if (issue) {
        throw new DomainError(modifierSelectionMessage(issue, dish.name), 'validation_error')
      }
      const lineCents = unitCents * line.quantity
      subtotalCents += lineCents
      return {
        menuItemId: line.menuItemId,
        name: dish.name,
        quantity: line.quantity,
        unitPrice: text(unitCents),
        lineTotal: text(lineCents),
      }
    })

    // ── Envío ────────────────────────────────────────────────────────────────
    // La misma función que usa la guardia del umbral de `POST /customer/orders`.
    const isDelivery = body.deliveryMethod === 'delivery'
    const {
      deliveryBand,
      nominalCents,
      freeReason,
      deliveryCents,
      reliable: deliveryReliable,
    } = await quoteDelivery(service, asUser, {
      businessId: body.businessId,
      isDelivery,
      coordinates: body.coordinates,
      itemIds: body.items.map((i) => i.menuItemId),
      businessDeliveryFee: biz.delivery_fee,
      logScope: 'checkout/quote',
    })
    const totalCents = subtotalCents + deliveryCents

    // ── Vuelto máximo y umbral de prepago ────────────────────────────────────
    const { data: settings, error: settingsErr } = await service
      .from('app_settings')
      .select('key,value')
      .in('key', ['prepay_threshold', 'max_change', 'max_cash_bill'])
    // Lectura fallida ≠ clave ausente: con la lectura rota los respaldos (80 / 100)
    // podrían ofrecer más que los ajustes reales, así que `payment` va al lado seguro.
    if (settingsErr) console.error('[checkout/quote] ajustes:', settingsErr.message)
    const setting = (key: string): unknown => settings?.find((s) => s.key === key)?.value
    const rawThreshold = setting('prepay_threshold')
    const threshold = Number(rawThreshold ?? 80)
    // La decisión usa los céntimos SIN acotar, igual que develop (CAX-011): subtotal y envío caben cada
    // uno en numeric(10,2) pero su suma puede pasar de MAX_MONEY, y acotar el umbral cambiaría el resultado.
    const thresholdCents = cents(Number.isFinite(threshold) ? threshold : 80)
    // Solo el TEXTO se acota, y solo si los céntimos no son un entero seguro (`"1e308"` daría
    // `Infinity`, CAX-008).
    const maxCents = cents(MAX_MONEY)
    const thresholdText = Number.isSafeInteger(thresholdCents)
      ? text(thresholdCents)
      : text(thresholdCents < 0 ? -maxCents : maxCents)
    // CAX-010: `prepaid` solo se retira si todo lo que decide el umbral es cierto para JavaScript: la
    // tarifa del envío y un umbral ausente, null o con céntimos completos. Un umbral como `"+0x10"`
    // (JavaScript usa 80, SQL 16) o `49.995` (JavaScript redondea) deja la decisión a SQL.
    const amountsCertain =
      deliveryReliable &&
      (rawThreshold === undefined || rawThreshold === null || isMoneyNumber(rawThreshold))

    const { data: change, error: changeErr } = await asUser.rpc('effective_max_change', {
      p_business_id: body.businessId,
    })
    if (changeErr) console.error('[checkout/quote] vuelto máximo:', changeErr.message)
    const changeValue = Number(changeErr ? setting('max_change') : change)

    // ── Métodos de pago ──────────────────────────────────────────────────────
    // El MISMO predicado que la creación: `customer_contraentrega_decision` es la
    // fuente única y la capa HTTP solo corta `risk_blocked` (ver el comentario en
    // `customer/orders/route.ts`, guard de contraentrega). `no_history` NO se
    // corta: lo decide `create_customer_order` con el GPS o el mostrador. Un error
    // del RPC va al lado seguro, como allí.
    const { data: decision, error: decisionErr } = await service.rpc(
      'customer_contraentrega_decision',
      { p_customer_user_id: user.id },
    )
    if (decisionErr)
      console.error('[checkout/quote] decisión de contraentrega:', decisionErr.message)
    const maxChangeText = toMoneyText(Number.isFinite(changeValue) ? changeValue : 0) ?? '0.00'
    const payment = planQuotePayment({
      deliveryMethod: body.deliveryMethod,
      pickupTiming: body.pickupTiming ?? null,
      contraentregaAllowed: decisionErr === null && decision !== 'risk_blocked',
      customerTrusted: decisionErr === null && decision === 'trusted',
      amountsCertain,
      settingsReliable: settingsErr === null && changeErr === null,
      exceedsPrepayThreshold: totalCents > thresholdCents,
      // Mismo respaldo que `create_customer_order`: S/ 100 si el ajuste falta.
      maxCashBill: toMoneyText(setting('max_cash_bill') ?? 100) ?? '100.00',
      maxChange: maxChangeText,
    })

    return ok(
      {
        businessId: body.businessId,
        deliveryMethod: body.deliveryMethod,
        items: lines,
        subtotal: text(subtotalCents),
        deliveryBand,
        nominalDeliveryFee: text(nominalCents),
        deliveryFee: text(deliveryCents),
        freeDelivery: { applies: freeReason !== null, reason: freeReason },
        total: text(totalCents),
        maxChange: maxChangeText,
        prepayThreshold: thresholdText,
        exceedsPrepayThreshold: totalCents > thresholdCents,
        payment,
      },
      { headers: privateHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
