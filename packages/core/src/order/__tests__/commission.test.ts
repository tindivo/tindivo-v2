import { describe, expect, it } from 'vitest'
import { CommissionConfigError } from '../../shared/errors'
import { type CommissionConfig, computeCommission } from '../commission'

const config: CommissionConfig = { pickup: 0.5, near: 3.0, far: 3.5 }

describe('computeCommission (modelo de dinero, Documento Maestro §1)', () => {
  it('Cerca = S/3.00', () => {
    expect(computeCommission({ deliveryMethod: 'delivery', band: 'near', config })).toBe(3.0)
  })

  it('Lejos = S/3.50', () => {
    expect(computeCommission({ deliveryMethod: 'delivery', band: 'far', config })).toBe(3.5)
  })

  it('Pickup = S/0.50 (sin banda)', () => {
    expect(computeCommission({ deliveryMethod: 'pickup', band: null, config })).toBe(0.5)
  })

  it('aplica overrides por negocio cuando existen', () => {
    expect(
      computeCommission({
        deliveryMethod: 'delivery',
        band: 'near',
        config,
        overrides: { near: 2.5 },
      }),
    ).toBe(2.5)
  })

  it('ignora overrides null (usa default global)', () => {
    expect(
      computeCommission({
        deliveryMethod: 'delivery',
        band: 'far',
        config,
        overrides: { far: null },
      }),
    ).toBe(3.5)
  })

  it('exige banda en delivery (la declara el motorizado al recoger)', () => {
    expect(() => computeCommission({ deliveryMethod: 'delivery', band: null, config })).toThrow(
      CommissionConfigError,
    )
  })
})
