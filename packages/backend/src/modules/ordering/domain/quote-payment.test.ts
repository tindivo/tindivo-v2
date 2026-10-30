import { describe, expect, it } from 'vitest'
import { CASH_STEP_TEXT, planQuotePayment, type QuotePaymentInput } from './quote-payment'

const base: QuotePaymentInput = {
  deliveryMethod: 'delivery',
  pickupTiming: null,
  contraentregaAllowed: true,
  exceedsPrepayThreshold: false,
  settingsReliable: true,
  maxCashBill: '100.00',
  maxChange: '20.00',
}

const opt = (input: QuotePaymentInput, intent: string) => {
  const found = planQuotePayment(input).options.find((o) => o.intent === intent)
  if (!found) throw new Error(`falta la opción ${intent}`)
  return found
}

describe('planQuotePayment', () => {
  it('delivery con cliente de confianza: las tres, en orden, y el efectivo declara billete', () => {
    const r = planQuotePayment(base)
    expect(r.options.map((o) => o.intent)).toEqual(['pending_cash', 'pending_yape', 'prepaid'])
    expect(r.options.every((o) => o.available && o.unavailableReason === null)).toBe(true)
    expect(r.cash).toEqual({ maxBill: '100.00', maxChange: '20.00', step: CASH_STEP_TEXT })
    expect(CASH_STEP_TEXT).toBe('0.50')
  })

  it('prepaid siempre disponible', () => {
    const input = { ...base, contraentregaAllowed: false, exceedsPrepayThreshold: true }
    expect(opt(input, 'prepaid')).toEqual({
      intent: 'prepaid',
      available: true,
      unavailableReason: null,
    })
  })

  it('sin confianza: la contraentrega es prepay_required y no hay bloque de efectivo', () => {
    const input = { ...base, contraentregaAllowed: false }
    expect(opt(input, 'pending_cash')).toMatchObject({
      available: false,
      unavailableReason: 'prepay_required',
    })
    expect(opt(input, 'pending_yape')).toMatchObject({
      available: false,
      unavailableReason: 'prepay_required',
    })
    expect(planQuotePayment(input).cash).toBeNull()
  })

  it('total sobre el umbral: exceeds_threshold', () => {
    const input = { ...base, exceedsPrepayThreshold: true }
    expect(opt(input, 'pending_cash').unavailableReason).toBe('exceeds_threshold')
    expect(planQuotePayment(input).cash).toBeNull()
  })

  it('precedencia: prepay_required > exceeds_threshold > pickup_later', () => {
    const later: QuotePaymentInput = {
      ...base,
      deliveryMethod: 'pickup',
      pickupTiming: 'later',
      exceedsPrepayThreshold: true,
    }
    expect(opt({ ...later, contraentregaAllowed: false }, 'pending_cash').unavailableReason).toBe(
      'prepay_required',
    )
    expect(opt(later, 'pending_cash').unavailableReason).toBe('exceeds_threshold')
    expect(opt({ ...later, exceedsPrepayThreshold: false }, 'pending_cash').unavailableReason).toBe(
      'pickup_later',
    )
  })

  it('recojo later: pickup_later, sin yape y sin efectivo declarado', () => {
    const input: QuotePaymentInput = { ...base, deliveryMethod: 'pickup', pickupTiming: 'later' }
    const r = planQuotePayment(input)
    expect(r.options.map((o) => o.intent)).toEqual(['pending_cash', 'prepaid'])
    expect(opt(input, 'pending_cash')).toMatchObject({
      available: false,
      unavailableReason: 'pickup_later',
    })
    expect(r.cash).toBeNull()
  })

  it('recojo now: sin pending_yape, caja disponible y cash null', () => {
    const input: QuotePaymentInput = { ...base, deliveryMethod: 'pickup', pickupTiming: 'now' }
    const r = planQuotePayment(input)
    expect(r.options.map((o) => o.intent)).toEqual(['pending_cash', 'prepaid'])
    expect(opt(input, 'pending_cash').available).toBe(true)
    expect(r.cash).toBeNull()
  })

  it('recojo sin contestar cuándo: se trata como later (como la creación)', () => {
    const input: QuotePaymentInput = { ...base, deliveryMethod: 'pickup', pickupTiming: null }
    expect(opt(input, 'pending_cash')).toMatchObject({
      available: false,
      unavailableReason: 'pickup_later',
    })
    expect(opt(input, 'prepaid').available).toBe(true)
    expect(planQuotePayment(input).cash).toBeNull()
  })

  it('lectura de ajustes fallida: solo prepaid, prepay_required y cash null', () => {
    for (const allowed of [true, false]) {
      const input = { ...base, settingsReliable: false, contraentregaAllowed: allowed }
      const r = planQuotePayment(input)
      expect(opt(input, 'pending_cash')).toMatchObject({
        available: false,
        unavailableReason: 'prepay_required',
      })
      expect(opt(input, 'pending_yape')).toMatchObject({
        available: false,
        unavailableReason: 'prepay_required',
      })
      expect(opt(input, 'prepaid').available).toBe(true)
      expect(r.cash).toBeNull()
    }
  })

  it('lectura fallida en recojo now: también prepay_required', () => {
    const input: QuotePaymentInput = {
      ...base,
      deliveryMethod: 'pickup',
      pickupTiming: 'now',
      settingsReliable: false,
    }
    expect(opt(input, 'pending_cash').unavailableReason).toBe('prepay_required')
  })

  it('delivery ignora pickupTiming nulo: contraentrega disponible', () => {
    expect(opt(base, 'pending_cash').available).toBe(true)
  })
})
