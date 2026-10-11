import { describe, expect, it } from 'vitest'
import { toMoneyText } from '../mappers/money-text'

describe('toMoneyText (D-39: el dinero nuevo viaja como texto)', () => {
  it('da siempre dos decimales', () => {
    expect(toMoneyText(100)).toBe('100.00')
    expect(toMoneyText(2.5)).toBe('2.50')
    expect(toMoneyText('12.5')).toBe('12.50')
    expect(toMoneyText(0)).toBe('0.00')
  })

  it('un valor que no es monto no se vuelve "NaN"', () => {
    expect(toMoneyText(null)).toBeNull()
    expect(toMoneyText(undefined)).toBeNull()
    expect(toMoneyText('')).toBeNull()
    expect(toMoneyText('abc')).toBeNull()
    expect(toMoneyText(-1)).toBeNull()
    expect(toMoneyText({})).toBeNull()
  })
})
