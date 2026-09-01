import { describe, expect, it } from 'vitest'
import { cashError, changeFor, maxDeclarable } from '@/features/checkout/lib/cash'

/**
 * La regla del vuelto la leen tres sitios —el selector, el CTA y el envío— y
 * los tres tienen que decir lo mismo. Estos tests fijan el CONTRATO de la
 * función, no su redacción: comprueban qué monto se acepta y cuál no, y que el
 * consejo que da al rechazar sea a su vez aceptable.
 */
const BASE = { total: 38, maxCashBill: 100, maxChange: 50 }

describe('maxDeclarable', () => {
  it('lo limita el vuelto cuando la caja tiene poco', () => {
    expect(maxDeclarable({ total: 38, maxCashBill: 100, maxChange: 10 })).toBe(48)
  })

  it('lo limita el billete máximo cuando la caja tiene de sobra', () => {
    expect(maxDeclarable({ total: 38, maxCashBill: 100, maxChange: 500 })).toBe(100)
  })

  it('sin sencillo, solo el pago exacto', () => {
    expect(maxDeclarable({ total: 38, maxCashBill: 100, maxChange: 0 })).toBe(38)
  })
})

describe('changeFor', () => {
  it('no devuelve negativos', () => {
    expect(changeFor(20, 38)).toBe(0)
  })

  it('redondea a céntimos y no arrastra el error del float', () => {
    // 50 - 38.1 en binario da 11.899999999999999
    expect(changeFor(50, 38.1)).toBe(11.9)
  })
})

describe('cashError', () => {
  it('acepta el pago exacto', () => {
    expect(cashError(38, BASE)).toBeNull()
  })

  it('acepta un billete que la caja puede devolver', () => {
    expect(cashError(50, BASE)).toBeNull()
  })

  it('rechaza un monto que no cubre el total', () => {
    expect(cashError(20, BASE)).toMatch(/cubrir el total/)
  })

  it('rechaza por encima del billete máximo antes que por el vuelto', () => {
    // 200 falla por las dos razones. Manda la del billete: es la que el cliente
    // puede corregir sin saber cuánto sencillo tiene el negocio esta noche.
    expect(cashError(200, BASE)).toMatch(/monto máximo/)
  })

  it('rechaza cuando el vuelto pasa del que hay esta noche', () => {
    expect(cashError(100, BASE)).toMatch(/vuelto sería/)
  })

  it('sin sencillo manda al pago exacto o a Yape', () => {
    const msg = cashError(50, { ...BASE, maxChange: 0 })
    expect(msg).toMatch(/no tiene vuelto/)
    expect(msg).toMatch(/Yape o Plin/)
  })

  it('el monto que aconseja es a su vez aceptable', () => {
    // La red que importa: si el consejo redondeara hacia arriba, el cliente
    // haría exactamente lo que se le dice y el servidor lo rechazaría.
    const limites = { total: 38.4, maxCashBill: 100, maxChange: 7.35 }
    const msg = cashError(100, limites)
    expect(msg).not.toBeNull()
    const aconsejado = Number(/con S\/ ([\d.]+) o menos/.exec(msg ?? '')?.[1])
    expect(Number.isFinite(aconsejado)).toBe(true)
    expect(cashError(aconsejado, limites)).toBeNull()
  })

  it('un monto vacío o cero pide escribirlo, no acusa de nada', () => {
    expect(cashError(Number.NaN, BASE)).toMatch(/Escribe con cuánto/)
    expect(cashError(0, BASE)).toMatch(/Escribe con cuánto/)
  })
})
