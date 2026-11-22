/**
 * 0291 · `courier_service_status()` dice el peso máximo (CA-ENT-11) y un ajuste mal escrito no cierra Entregas.
 */
import { CourierServiceStatusSchema } from '@tindivo/contracts/openapi'
import type { Json } from '@tindivo/supabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as service } from './helpers/local-db'

async function readCourier(): Promise<Json> {
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  if (error) throw error
  return data.value
}

async function writeCourier(value: Json): Promise<void> {
  const { error } = await service.from('app_settings').update({ value }).eq('key', 'courier')
  if (error) throw error
}

/** El ajuste `courier` con `maxWeightKg` cambiado (`undefined` = sin la clave). */
function withWeight(base: Json, weight: Json | undefined): Json {
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error('app_settings.courier no es un objeto')
  }
  const { maxWeightKg: _anterior, ...rest } = base
  return weight === undefined ? rest : { ...rest, maxWeightKg: weight }
}

async function status() {
  const { data, error } = await service.rpc('courier_service_status')
  if (error) throw error
  return CourierServiceStatusSchema.parse(data)
}

describe('0291 · courier_service_status', () => {
  let original: Json = null

  beforeAll(async () => {
    original = await readCourier()
  })

  afterAll(async () => {
    if (original !== null) await writeCourier(original)
  })

  it('CA-ENT-11 · devuelve maxWeightKg con el valor de courier.maxWeightKg', async () => {
    await writeCourier(withWeight(original, 5))
    expect((await status()).maxWeightKg).toBe(5)
  })

  it('CA-ENT-11 · un peso decimal llega tal cual', async () => {
    await writeCourier(withWeight(original, 7.5))
    expect((await status()).maxWeightKg).toBe(7.5)
  })

  it.each([
    ['sin el ajuste', undefined],
    ['con null', null],
    ['con texto', 'cinco'],
    ['con cero', 0],
    ['con un valor negativo', -3],
  ] as const)('CA-ENT-11 · %s omite la clave, no falla y no cierra Entregas', async (_caso, weight) => {
    await writeCourier(withWeight(original, weight))
    const s = await status()
    expect(s.maxWeightKg).toBeUndefined()
    expect(s.enabled).toBeDefined()
    expect(s.price).toBeDefined()
  })
})
