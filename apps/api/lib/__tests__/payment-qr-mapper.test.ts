import { describe, expect, it } from 'vitest'
import { toPaymentQrViews } from '../mappers/payment-qr'

/**
 * El orden de las cuentas de cobro (0184).
 *
 * Parece trivial y no lo es: `default_payment_qr_slot` es un PUNTERO, no una
 * garantía. Puede apuntar a un slot que ya no existe —el negocio borró esa
 * cuenta— y de cómo se resuelva ese caso depende que el motorizado enseñe algo
 * o enseñe un hueco en la puerta del cliente.
 *
 * Y hay una segunda razón para fijarlo aquí: este mismo orden lo consumen el
 * motorizado, el cliente y el panel de la cajera. Si divergieran, la cajera
 * conciliaría contra una cuenta y el cliente habría pagado a la otra.
 */

type Row = Parameters<typeof toPaymentQrViews>[0]

const yape = {
  slot: 1,
  wallet: 'yape',
  account_number: '900000001',
  account_name: 'La Florencia',
  qr_url: 'a',
}
const plin = {
  slot: 2,
  wallet: 'plin',
  account_number: '955512345',
  account_name: 'La Florencia',
  qr_url: 'b',
}

describe('toPaymentQrViews', () => {
  it('pone primero el slot que el negocio eligió', () => {
    const r = toPaymentQrViews([yape, plin] as Row, 2)
    expect(r.map((x) => x.slot)).toEqual([2, 1])
    expect(r[0].isDefault).toBe(true)
    expect(r[1].isDefault).toBe(false)
  })

  it('no depende del orden en que la base devuelva las filas', () => {
    const r = toPaymentQrViews([plin, yape] as Row, 1)
    expect(r.map((x) => x.slot)).toEqual([1, 2])
  })

  it('cae a la cuenta que quede cuando el puntero señala un slot borrado', () => {
    // El caso que importa: el negocio borró su cuenta principal y el puntero se
    // quedó colgando. Enseñar el repuesto es lo correcto; no enseñar nada
    // dejaría al motorizado cobrando a mano sin motivo.
    const r = toPaymentQrViews([plin] as Row, 1)
    expect(r).toHaveLength(1)
    expect(r[0].slot).toBe(2)
    expect(r[0].isDefault).toBe(true)
  })

  it('marca exactamente una principal, nunca dos ni ninguna', () => {
    for (const puntero of [1, 2, 7]) {
      const r = toPaymentQrViews([yape, plin] as Row, puntero)
      expect(r.filter((x) => x.isDefault)).toHaveLength(1)
    }
  })

  it('sin cuentas devuelve lista vacía, no revienta', () => {
    expect(toPaymentQrViews(null, 1)).toEqual([])
    expect(toPaymentQrViews([], 1)).toEqual([])
  })

  it('traduce los nombres de columna al contrato que ven las apps', () => {
    const [r] = toPaymentQrViews([yape] as Row, 1)
    expect(r).toEqual({
      slot: 1,
      wallet: 'yape',
      accountNumber: '900000001',
      accountName: 'La Florencia',
      qrUrl: 'a',
      isDefault: true,
    })
  })
})
