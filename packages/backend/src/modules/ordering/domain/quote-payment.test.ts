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

  it('precedencia: prepay_required > exceeds_threshold', () => {
    const alto: QuotePaymentInput = { ...base, exceedsPrepayThreshold: true }
    expect(opt({ ...alto, contraentregaAllowed: false }, 'pending_cash').unavailableReason).toBe(
      'prepay_required',
    )
    expect(opt(alto, 'pending_cash').unavailableReason).toBe('exceeds_threshold')
  })

  it('0283 · todo recojo (ahora, más tarde o sin contestar) solo ofrece prepaid', () => {
    for (const pickupTiming of ['now', 'later', null] as const) {
      const input: QuotePaymentInput = { ...base, deliveryMethod: 'pickup', pickupTiming }
      const r = planQuotePayment(input)
      expect(r.options, `pickupTiming=${pickupTiming}`).toEqual([
        { intent: 'prepaid', available: true, unavailableReason: null },
      ])
      expect(r.cash).toBeNull()
    }
  })

  it('0283 · un recojo no emite pickup_later ni siquiera con el cliente de riesgo', () => {
    const input: QuotePaymentInput = {
      ...base,
      deliveryMethod: 'pickup',
      pickupTiming: 'later',
      contraentregaAllowed: false,
      exceedsPrepayThreshold: true,
    }
    expect(planQuotePayment(input).options.map((o) => o.unavailableReason)).toEqual([null])
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

  it('delivery ignora pickupTiming nulo: contraentrega disponible', () => {
    expect(opt(base, 'pending_cash').available).toBe(true)
  })
})
