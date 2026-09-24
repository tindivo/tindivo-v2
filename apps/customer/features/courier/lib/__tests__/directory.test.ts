import { describe, expect, it } from 'vitest'
import { directoryCardStateOf } from '../directory'

describe('directoryCardStateOf', () => {
  it('aliado gana sobre courier_enabled (spec v1 §3.1)', () => {
    expect(directoryCardStateOf({ isPartner: true, courierEnabled: true })).toBe('partner')
  })

  it('recojo habilitado cuando no es aliado', () => {
    expect(directoryCardStateOf({ isPartner: false, courierEnabled: true })).toBe('courier_enabled')
  })

  it('solo visible cuando ninguno de los dos', () => {
    expect(directoryCardStateOf({ isPartner: false, courierEnabled: false })).toBe('visible_only')
  })
})
