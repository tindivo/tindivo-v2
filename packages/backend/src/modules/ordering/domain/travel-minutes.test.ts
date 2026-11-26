import { describe, expect, it } from 'vitest'
import { travelMinutesFrom } from './travel-minutes'

describe('el trayecto del detalle del pedido', () => {
  it('CA-TRK-04 sin ajuste el trayecto es null y no un 20-25 inventado', () => {
    expect(travelMinutesFrom(undefined)).toBeNull()
    expect(travelMinutesFrom({})).toBeNull()
    expect(travelMinutesFrom({ travelMinutesMin: 20 })).toBeNull()
    expect(travelMinutesFrom({ travelMinutesMin: 25, travelMinutesMax: 20 })).toBeNull()
    expect(travelMinutesFrom({ travelMinutesMin: '20', travelMinutesMax: 25 })).toBeNull()
    expect(travelMinutesFrom({ travelMinutesMin: 15, travelMinutesMax: 30 })).toEqual({
      min: 15,
      max: 30,
    })
  })
})
