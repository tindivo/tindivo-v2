import type { DISTANCE_BANDS } from '@tindivo/contracts'
import type { createServiceClient } from '@/lib/supabase/service'
import type { createUserClient } from '@/lib/supabase/user'

/** Soles -> céntimos enteros: la suma no arrastra error de coma flotante. */
export const cents = (soles: number): number => Math.round(soles * 100)

export interface DeliveryQuote {
  deliveryBand: (typeof DISTANCE_BANDS)[number] | null
  /** Tarifa de la banda, antes de promociones. */
  nominalCents: number
  freeReason: 'launch_promo' | 'dish' | null
  /** Lo que se cobra de envío: 0 si hay promoción. */
  deliveryCents: number
  /**
   * `false` si falló la lectura de una promoción. El envío queda entonces sin
   * descuento (lado seguro para PINTAR); quien use este valor para RECHAZAR un
   * pedido no debe hacerlo: la decide `create_customer_order`.
   */
  reliable: boolean
}

/**
 * El envío de un pedido, con el mismo orden que `create_customer_order` (0283):
 * banda del punto (`delivery_band_for_point`) y su tarifa de `delivery_bands`, con
 * respaldo en la tarifa del negocio y luego S/ 2.00; después la promoción de
 * lanzamiento y por último el envío gratis por plato.
 *
 * Es la ÚNICA copia en TypeScript: la usan la cotización (`checkout/quote`) y la
 * guardia del umbral de la creación (`orders`), para que no puedan divergir (DES-5).
 * `asUser` es obligatorio: la promoción de lanzamiento responde por `auth.uid()`.
 */
export async function quoteDelivery(
  service: ReturnType<typeof createServiceClient>,
  asUser: ReturnType<typeof createUserClient>,
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
    const bands = (bandsSetting?.value ?? {}) as Record<string, unknown>
    const fromBands = Number(bands[deliveryBand])
    // Mismo orden que `create_customer_order`: banda, tarifa del negocio, S/ 2.00.
    const fee = Number.isFinite(fromBands)
      ? fromBands
      : input.businessDeliveryFee != null
        ? Number(input.businessDeliveryFee)
        : 2
    nominalCents = cents(fee)
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
