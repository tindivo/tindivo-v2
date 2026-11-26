import type { TypedSupabaseClient } from '@tindivo/supabase'
import { type DeliveryBand, nominalDeliveryFee } from '../domain/delivery-fee'

export interface DeliveryQuote {
  deliveryBand: DeliveryBand | null
  /** Tarifa de la banda, antes de promociones. */
  nominalCents: number
  freeReason: 'launch_promo' | 'dish' | null
  /** Lo que se cobra de envío: 0 si hay promoción. */
  deliveryCents: number
  /**
   * `false` si falló CUALQUIER lectura (la banda, la tarifa de la banda, la tarifa
   * del negocio o una de las dos promociones). El total queda entonces con respaldos
   * o sin descuento (lado seguro para PINTAR); quien use este valor para RECHAZAR un
   * pedido no debe hacerlo: lo decide `create_customer_order`.
   */
  reliable: boolean
}

/**
 * El envío de un pedido, con el mismo orden que `create_customer_order` (0283):
 * banda del punto (`delivery_band_for_point`) y su tarifa, después la promoción de
 * lanzamiento y por último el envío gratis por plato.
 *
 * La usan la cotización (`checkout/quote`) y la guardia del umbral de la creación
 * (`orders`), para que no puedan divergir (DES-5). `asUser` es obligatorio: la
 * promoción de lanzamiento responde por `auth.uid()`.
 */
export async function quoteDelivery(
  service: TypedSupabaseClient,
  asUser: TypedSupabaseClient,
  input: {
    businessId: string
    isDelivery: boolean
    coordinates?: { lat: number; lng: number } | undefined
    itemIds: string[]
    /**
     * `businesses.delivery_fee`: respaldo de la tarifa de la banda. Si no se pasa
     * (`undefined`), la función la lee ella misma y un fallo de lectura la deja
     * `reliable: false`; la cotización, que ya tiene el negocio, la pasa.
     */
    businessDeliveryFee?: number | string | null
    /**
     * Qué hacer si falla `delivery_band_for_point`: la cotización lanza (500, como
     * siempre) y la guardia de la creación sigue con la banda cercana y
     * `reliable: false`, para que decida la RPC.
     */
    onBandError?: 'throw' | 'unreliable'
    /** Prefijo de los registros de error (`checkout/quote`, `orders`). */
    logScope: string
  },
): Promise<DeliveryQuote> {
  let deliveryBand: DeliveryQuote['deliveryBand'] = null
  let nominalCents = 0
  let reliable = true
  if (input.isDelivery) {
    // Sin punto: banda cercana, igual que el checkout web. La creación exige
    // las coordenadas, así que esto es solo para pintar antes de elegirlas.
    deliveryBand = 'near'
    if (input.coordinates) {
      const { data: band, error } = await service.rpc('delivery_band_for_point', {
        p_lat: input.coordinates.lat,
        p_lng: input.coordinates.lng,
      })
      if (error) {
        if ((input.onBandError ?? 'throw') === 'throw') throw new Error(error.message)
        reliable = false
        console.error(`[${input.logScope}] banda del punto:`, error.message)
      } else if (band === 'far') deliveryBand = 'far'
    }
    const { data: bandsSetting, error: bandsErr } = await service
      .from('app_settings')
      .select('value, raw:value::text')
      .eq('key', 'delivery_bands')
      .maybeSingle()
    if (bandsErr) {
      reliable = false
      console.error(`[${input.logScope}] tarifas por banda:`, bandsErr.message)
    }
    let businessFee = input.businessDeliveryFee
    if (businessFee === undefined) {
      const { data: biz, error: bizErr } = await service
        .from('businesses')
        .select('delivery_fee')
        .eq('id', input.businessId)
        .maybeSingle()
      if (bizErr) {
        reliable = false
        console.error(`[${input.logScope}] tarifa del negocio:`, bizErr.message)
      }
      businessFee = biz?.delivery_fee ?? null
    }
    const fee = nominalDeliveryFee(
      deliveryBand,
      bandsSetting?.value,
      businessFee,
      bandsErr ? undefined : (bandsSetting?.raw ?? null),
    )
    // Una tarifa de banda PRESENTE pero que no es un número: SQL falla al convertirla; el respaldo
    // sirve para pintar, no para rechazar (CAX-006).
    if (!fee.reliable) {
      reliable = false
      console.error(`[${input.logScope}] tarifa de banda o del negocio no ordinaria`)
    }
    nominalCents = fee.cents
  }

  // ── Envío gratis: promo de lanzamiento primero, luego por plato ─────────────
  let freeReason: DeliveryQuote['freeReason'] = null
  if (input.isDelivery && nominalCents > 0) {
    const { data: promo, error: promoErr } = await asUser.rpc(
      'current_customer_promo_free_delivery',
    )
    if (promoErr) {
      reliable = false
      console.error(`[${input.logScope}] promo de envío:`, promoErr.message)
    } else if ((promo as { eligible?: boolean } | null)?.eligible === true) {
      freeReason = 'launch_promo'
    }
    if (!freeReason) {
      const { data: dish, error: dishRpcErr } = await asUser.rpc('cart_item_free_delivery', {
        p_business_id: input.businessId,
        p_item_ids: input.itemIds,
      })
      if (dishRpcErr) {
        reliable = false
        console.error(`[${input.logScope}] envío gratis por plato:`, dishRpcErr.message)
      } else if (dish === true) freeReason = 'dish'
    }
  }
  return {
    deliveryBand,
    nominalCents,
    freeReason,
    deliveryCents: freeReason ? 0 : nominalCents,
    reliable,
  }
}
