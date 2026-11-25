import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it, vi } from 'vitest'
import { quoteDelivery } from './delivery-quote'

interface Script {
  band?: 'near' | 'far'
  bandError?: boolean
  bands?: Record<string, number> | null
  bandsError?: boolean
  bizFee?: number | null
  bizError?: boolean
  launchEligible?: boolean
  launchError?: boolean
  dish?: boolean
  dishError?: boolean
}

const fail = { message: 'lectura inyectada' }

/** Cliente de mentira: solo contesta lo que `quoteDelivery` pregunta. */
function fake(script: Script): { service: TypedSupabaseClient; asUser: TypedSupabaseClient } {
  const row = (table: string): { data: unknown; error: unknown } => {
    if (table === 'app_settings') {
      return script.bandsError
        ? { data: null, error: fail }
        : {
            data: script.bands === null ? null : { value: script.bands ?? { near: 2, far: 2.5 } },
            error: null,
          }
    }
    return script.bizError
      ? { data: null, error: fail }
      : { data: { delivery_fee: script.bizFee ?? null }, error: null }
  }
  const service = {
    rpc: async () =>
      script.bandError ? { data: null, error: fail } : { data: script.band ?? 'near', error: null },
    from: (table: string) => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => row(table) }
      return chain
    },
  }
  const asUser = {
    rpc: async (name: string) => {
      if (name === 'current_customer_promo_free_delivery') {
        return script.launchError
          ? { data: null, error: fail }
          : { data: { eligible: script.launchEligible === true }, error: null }
      }
      return script.dishError
        ? { data: null, error: fail }
        : { data: script.dish === true, error: null }
    },
  }
  return {
    service: service as unknown as TypedSupabaseClient,
    asUser: asUser as unknown as TypedSupabaseClient,
  }
}

const base = {
  businessId: 'b',
  isDelivery: true,
  coordinates: { lat: -9.15, lng: -78.28 },
  itemIds: ['i'],
  logScope: 'prueba',
}

async function quote(script: Script, extra: Record<string, unknown> = {}) {
  const { service, asUser } = fake(script)
  return quoteDelivery(service, asUser, { ...base, ...extra })
}

describe('quoteDelivery', () => {
  it('sin fallos: banda cercana, sin promoción, fiable', async () => {
    expect(await quote({}, { businessDeliveryFee: 3 })).toEqual({
      deliveryBand: 'near',
      nominalCents: 200,
      freeReason: null,
      deliveryCents: 200,
      reliable: true,
    })
  })

  it('banda lejana: 2.50', async () => {
    expect(await quote({ band: 'far' }, { businessDeliveryFee: 3 })).toMatchObject({
      deliveryBand: 'far',
      nominalCents: 250,
      reliable: true,
    })
  })

  it('envío gratis por plato: deliveryCents 0 y el nominal se conserva', async () => {
    expect(await quote({ dish: true }, { businessDeliveryFee: 3 })).toMatchObject({
      freeReason: 'dish',
      nominalCents: 200,
      deliveryCents: 0,
      reliable: true,
    })
  })

  it('promoción de lanzamiento: gana a la del plato y no pregunta por ella', async () => {
    expect(
      await quote({ launchEligible: true, dish: true }, { businessDeliveryFee: 3 }),
    ).toMatchObject({
      freeReason: 'launch_promo',
      deliveryCents: 0,
      reliable: true,
    })
  })

  it('recojo: sin envío ni promociones', async () => {
    expect(await quote({ dish: true }, { isDelivery: false, businessDeliveryFee: 3 })).toEqual({
      deliveryBand: null,
      nominalCents: 0,
      freeReason: null,
      deliveryCents: 0,
      reliable: true,
    })
  })

  describe('CAX-002: cualquier lectura fallida deja reliable en false', () => {
    it('fallo de las tarifas por banda: cae a la tarifa del negocio y NO es fiable', async () => {
      const r = await quote({ bandsError: true, bizFee: 3 })
      expect(r).toMatchObject({ nominalCents: 300, deliveryCents: 300, reliable: false })
    })

    it('fallo de la tarifa del negocio (la lee la propia función)', async () => {
      const r = await quote({ bizError: true })
      expect(r).toMatchObject({ nominalCents: 200, reliable: false })
    })

    it('si la tarifa del negocio ya viene dada, no se vuelve a leer', async () => {
      const r = await quote({ bizError: true }, { businessDeliveryFee: 3 })
      expect(r.reliable).toBe(true)
    })

    it('fallo de la promoción de lanzamiento, sin descuento real', async () => {
      const r = await quote({ launchError: true }, { businessDeliveryFee: 3 })
      expect(r).toMatchObject({ freeReason: null, deliveryCents: 200, reliable: false })
    })

    it('fallo de la promoción de lanzamiento, con descuento real por plato', async () => {
      const r = await quote({ launchError: true, dish: true }, { businessDeliveryFee: 3 })
      expect(r).toMatchObject({ freeReason: 'dish', deliveryCents: 0, reliable: false })
    })

    it('fallo del envío gratis por plato, sin descuento real', async () => {
      const r = await quote({ dishError: true }, { businessDeliveryFee: 3 })
      expect(r).toMatchObject({ freeReason: null, deliveryCents: 200, reliable: false })
    })

    it('fallo del envío gratis por plato, con descuento real de lanzamiento', async () => {
      const r = await quote({ dishError: true, launchEligible: true }, { businessDeliveryFee: 3 })
      expect(r).toMatchObject({ freeReason: 'launch_promo', deliveryCents: 0, reliable: true })
    })

    it('fallo de la banda: la cotización lanza (500, como siempre)', async () => {
      await expect(quote({ bandError: true }, { businessDeliveryFee: 3 })).rejects.toThrow(
        'lectura inyectada',
      )
    })

    it('fallo de la banda en la guardia: sigue con la cercana y NO es fiable', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const r = await quote(
        { bandError: true, band: 'far' },
        { businessDeliveryFee: 3, onBandError: 'unreliable' },
      )
      spy.mockRestore()
      expect(r).toMatchObject({ deliveryBand: 'near', nominalCents: 200, reliable: false })
    })
  })
})
