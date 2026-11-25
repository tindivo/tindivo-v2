import type { TypedSupabaseClient } from '@tindivo/supabase'
import { type DeliveryBand, nominalDeliveryFeeCents } from '../domain/delivery-fee'

export interface DeliveryQuote {
  deliveryBand: DeliveryBand | null
  /** Tarifa de la banda, antes de promociones. */
  nominalCents: number
  freeReason: 'launch_promo' | 'dish' | null
  /** Lo que se cobra de envío: 0 si hay promoción. */
  deliveryCents: number
  /**
   * `false` si falló la lectura de una promoción. El envío queda entonces sin
   * descuento (lado seguro para PINTAR); quien use este valor para RECHAZAR un
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
    /** `businesses.delivery_fee`: respaldo de la tarifa de la banda. */
    businessDeliveryFee: number | string | null
    /** Prefijo de los registros de error (`checkout/quote`, `orders`). */
    logScope: string
  },
): Promise<DeliveryQuote> {
  let deliveryBand: DeliveryQuote['deliveryBand'] = null
  let nominalCents = 0
  if (input.isDelivery) {
    // Sin punto: banda cercana, igual que el checkout web. La creación exige
    // las coordenadas, así que esto es solo para pintar antes de elegirlas.
    deliveryBand = 'near'
    if (input.coordinates) {
      const { data: band, error } = await service.rpc('delivery_band_for_point', {
        p_lat: input.coordinates.lat,
        p_lng: input.coordinates.lng,
      })
      if (error) throw new Error(error.message)
      if (band === 'far') deliveryBand = 'far'
    }
    const { data: bandsSetting } = await service
      .from('app_settings')
      .select('value')
      .eq('key', 'delivery_bands')
      .maybeSingle()
    nominalCents = nominalDeliveryFeeCents(
      deliveryBand,
      bandsSetting?.value,
      input.businessDeliveryFee,
    )
  }

  // ── Envío gratis: promo de lanzamiento primero, luego por plato ─────────────
  let reliable = true
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
