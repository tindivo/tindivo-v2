/**
 * 0291 · `courier_service_status()` dice el peso máximo (CA-ENT-11).
 */
import { afterAll, describe, expect, it } from 'vitest'
import { localClient as service } from './helpers/local-db'

type Status = { maxWeightKg?: number; price: number; enabled: boolean }

async function courierSettings() {
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  if (error) throw error
  return data.value as Record<string, unknown>
}

async function status(): Promise<Status> {
  const { data, error } = await service.rpc('courier_service_status')
  if (error) throw error
  return data as Status
}

describe('0291 · courier_service_status', () => {
  let original: Record<string, unknown> | null = null

  afterAll(async () => {
    if (original)
      await service
        .from('app_settings')
        .update({ value: original as never })
        .eq('key', 'courier')
  })

  it('CA-ENT-11 · devuelve maxWeightKg con el valor de courier.maxWeightKg', async () => {
    const settings = await courierSettings()
    expect((await status()).maxWeightKg).toBe(settings.maxWeightKg)
  })

  it('CA-ENT-11 · sin el ajuste omite la clave y no inventa un peso', async () => {
    original = await courierSettings()
    const { maxWeightKg: _quitado, ...sin } = original
    await service
      .from('app_settings')
      .update({ value: sin as never })
      .eq('key', 'courier')
    const s = await status()
    expect('maxWeightKg' in s).toBe(false)
    expect(s.price).toBeDefined()
  })
})
