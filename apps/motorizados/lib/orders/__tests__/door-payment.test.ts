import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type DoorPayment,
  doorPayment,
  paymentRealForConfirmed,
  recheckDoorPayment,
  recheckWithTimeout,
  submitDecision,
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

describe('recheckWithTimeout · la relectura con tope', () => {
  const collect: DoorPayment = { mode: 'collect', proof: 'pending' }
  const confirmed: DoorPayment = { mode: 'confirmed_by_business', proof: 'verified' }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('si la relectura llega a tiempo y confirma, gana la confirmación y no falla', async () => {
    const r = await recheckWithTimeout(collect, () => Promise.resolve(confirmed), 4000)
    expect(r).toEqual({ door: confirmed, failed: false })
  })

  it('un pending_cash o pending_mixed con paymentVerifiedAt relee y sigue en collect', async () => {
    for (const paymentIntent of ['pending_cash', 'pending_mixed']) {
      const fresh = doorPayment({
        paymentIntent,
        paymentVerifiedAt: '2026-11-26T15:00:00Z',
        hasPaymentProof: false,
        paymentProofStatus: null,
      })
      const r = await recheckWithTimeout(collect, () => Promise.resolve(fresh), 4000)
      expect(r.door.mode).toBe('collect')
      expect(r.failed).toBe(false)
    }
  })

  it('si la relectura se rechaza, se queda lo viejo y falla', async () => {
    const r = await recheckWithTimeout(collect, () => Promise.reject(new Error('red')), 4000)
    expect(r).toEqual({ door: collect, failed: true })
  })

  it('si fetchFresh lanza de inmediato, también se queda lo viejo y falla', async () => {
    const r = await recheckWithTimeout(
      collect,
      () => {
        throw new Error('boom')
      },
      4000,
    )
    expect(r).toEqual({ door: collect, failed: true })
  })

  it('si el tope vence antes que la relectura, se queda lo viejo y falla', async () => {
    vi.useFakeTimers()
    const pending = recheckWithTimeout(collect, () => new Promise<DoorPayment>(() => {}), 4000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(await pending).toEqual({ door: collect, failed: true })
  })

  it('limpia el temporizador cuando gana la relectura', async () => {
    vi.useFakeTimers()
    const r = await recheckWithTimeout(collect, () => Promise.resolve(confirmed), 4000)
    expect(r.failed).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('submitDecision · qué se envía al pulsar «Confirmar entrega»', () => {
  const collect: DoorPayment = { mode: 'collect', proof: 'pending' }
  const confirmed: DoorPayment = { mode: 'confirmed_by_business', proof: 'verified' }
  const prepaid: DoorPayment = { mode: 'prepaid', proof: 'none' }

  it('se mostraba collect y el negocio confirmó: no se envía, la hoja cambia', () => {
    expect(submitDecision(collect, confirmed)).toBe('switch_to_confirmed')
  })

  it('se mostraba confirmado: se envía como confirmado', () => {
    expect(submitDecision(confirmed, confirmed)).toBe('submit_confirmed')
    expect(submitDecision(confirmed, collect)).toBe('submit_confirmed')
  })

  it('prepago: se envía como prepagado', () => {
    expect(submitDecision(prepaid, prepaid)).toBe('submit_prepaid')
  })

  it('se mostraba collect y sigue en collect: se envía lo elegido', () => {
    expect(submitDecision(collect, collect)).toBe('submit_as_chosen')
  })
})
