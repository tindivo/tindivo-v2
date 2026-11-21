import { describe, expect, it } from 'vitest'
import { CourierServiceStatusSchema } from '../openapi/public-responses'

const base = { enabled: true, openNow: true, hours: null, price: 3, pausedMessage: null }

describe('GET /public/courier/status', () => {
  it('CA-ENT-11 · trae el peso máximo del servidor cuando lo manda', () => {
    const parsed = CourierServiceStatusSchema.parse({ ...base, maxWeightKg: 5 })
    expect(parsed.maxWeightKg).toBe(5)
  })

  it('CA-ENT-11 · sin el campo sigue siendo válido (una app o un servidor anterior no se rompen)', () => {
    const parsed = CourierServiceStatusSchema.parse(base)
    expect(parsed.maxWeightKg).toBeUndefined()
  })

  it('CA-ENT-11 · el peso no puede ser cero ni negativo', () => {
    expect(CourierServiceStatusSchema.safeParse({ ...base, maxWeightKg: 0 }).success).toBe(false)
    expect(CourierServiceStatusSchema.safeParse({ ...base, maxWeightKg: -1 }).success).toBe(false)
  })
})
