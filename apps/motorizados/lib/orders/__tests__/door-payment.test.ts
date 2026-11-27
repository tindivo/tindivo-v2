import { describe, expect, it } from 'vitest'
import {
  type DoorPayment,
  doorPayment,
  paymentRealForConfirmed,
  recheckDoorPayment,
} from '../door-payment'

type Input = Parameters<typeof doorPayment>[0]

const base: Input = {
  paymentIntent: 'pending_yape',
  paymentVerifiedAt: null,
  hasPaymentProof: false,
  paymentProofStatus: null,
}

describe('doorPayment · qué se hace con el dinero en la puerta', () => {
  it('prepago: ya está pagado', () => {
    expect(doorPayment({ ...base, paymentIntent: 'prepaid' }).mode).toBe('prepaid')
  })

  it('pago único con el ingreso confirmado por el negocio: no se cobra', () => {
    expect(doorPayment({ ...base, paymentVerifiedAt: '2026-11-26T15:00:00Z' }).mode).toBe(
      'confirmed_by_business',
    )
  })

  it('pago único sin confirmar: se cobra', () => {
    expect(doorPayment(base).mode).toBe('collect')
  })

  it('efectivo o mixto con paymentVerifiedAt NO cambia: el servidor solo lo escribe en el pago único', () => {
    for (const paymentIntent of ['pending_cash', 'pending_mixed']) {
      expect(
        doorPayment({ ...base, paymentIntent, paymentVerifiedAt: '2026-11-26T15:00:00Z' }).mode,
      ).toBe('collect')
    }
  })

  it('sin captura, proof es none aunque el estado diga algo', () => {
    expect(
      doorPayment({ ...base, hasPaymentProof: false, paymentProofStatus: 'pending' }).proof,
    ).toBe('none')
  })

  it('con captura, proof sigue el estado', () => {
    const con = (paymentProofStatus: string | null) =>
      doorPayment({ ...base, hasPaymentProof: true, paymentProofStatus }).proof
    expect(con('pending')).toBe('pending')
    expect(con('rejected')).toBe('rejected')
    expect(con('verified')).toBe('verified')
  })

  it('con captura y estado desconocido o ausente, proof es pending', () => {
    const con = (paymentProofStatus: string | null | undefined) =>
      doorPayment({ ...base, hasPaymentProof: true, paymentProofStatus }).proof
    expect(con('otra_cosa')).toBe('pending')
    expect(con(null)).toBe('pending')
    expect(con(undefined)).toBe('pending')
  })

  it('un detalle sin los campos nuevos (servidor viejo) se cobra y no tiene captura', () => {
    expect(doorPayment({ paymentIntent: 'pending_yape' })).toEqual<DoorPayment>({
      mode: 'collect',
      proof: 'none',
    })
  })
})

describe('paymentRealForConfirmed', () => {
  it('cuando el negocio ya confirmó, lo que entró es Yape', () => {
    expect(paymentRealForConfirmed()).toBe('paid_yape')
  })
})

describe('recheckDoorPayment · la carrera de la puerta', () => {
  const collect: DoorPayment = { mode: 'collect', proof: 'pending' }
  const confirmed: DoorPayment = { mode: 'confirmed_by_business', proof: 'verified' }

  it('detalle viejo collect y relectura confirmada: gana la confirmación', () => {
    expect(recheckDoorPayment(collect, confirmed)).toEqual(confirmed)
  })

  it('si la relectura falló, se queda lo viejo', () => {
    expect(recheckDoorPayment(collect, null)).toEqual(collect)
  })

  it('si la relectura sigue diciendo collect, se queda la fresca (trae la captura al día)', () => {
    const fresh: DoorPayment = { mode: 'collect', proof: 'rejected' }
    expect(recheckDoorPayment(collect, fresh)).toEqual(fresh)
  })

  it('una relectura que dice prepaid no cambia lo viejo', () => {
    expect(recheckDoorPayment(collect, { mode: 'prepaid', proof: 'none' })).toEqual(collect)
  })
})
