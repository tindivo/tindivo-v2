import { describe, expect, it } from 'vitest'
import { addMoney, roundMoney, subtractMoney, toCents } from '../money'

describe('aritmética de dinero (céntimos, sin drift de coma flotante)', () => {
  it('addMoney evita el clásico 0.1 + 0.2 != 0.3', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(0.1 + 0.2).not.toBe(0.3) // confirma el problema que resolvemos
  })

  it('suma el delivery y la comida correctamente', () => {
    expect(addMoney(48.5, 2.5)).toBe(51.0)
  })

  it('roundMoney redondea a 2 decimales', () => {
    expect(roundMoney(3.014)).toBe(3.01)
    expect(roundMoney(3.016)).toBe(3.02)
    expect(roundMoney(2.5)).toBe(2.5)
  })

  it('subtractMoney es estable', () => {
    expect(subtractMoney(10.3, 0.1)).toBe(10.2)
  })

  it('toCents convierte a enteros', () => {
    expect(toCents(3.5)).toBe(350)
  })
})
