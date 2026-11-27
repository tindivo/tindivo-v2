import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import {
  deliveryPaymentDomainError,
  prepayProofState,
  prepayTotalText,
  registerDeliveryPaymentProof,
} from './delivery-payment'
import { nextProofAttempt } from './proof-upload'

type Reply = { data: unknown; error: { code: string; hint?: string; message: string } | null }

function dbWith(replies: Record<string, Reply>) {
  const calls: string[] = []
  const db = {
    rpc: async (name: string) => {
      calls.push(name)
      return replies[name] ?? { data: null, error: null }
    },
  } as unknown as TypedSupabaseClient
  return { db, calls }
}

const NOT_PREPAID: Reply = {
  data: null,
  error: { code: 'P0001', hint: 'order_not_awaiting_proof', message: 'ya no espera' },
}
const NOT_SINGLE: Reply = {
  data: null,
  error: { code: 'P0001', hint: 'order_not_pending_yape', message: 'no es pago único' },
}

describe('el prepago sigue primero: el pago único solo entra cuando el prepago se niega', () => {
  it('un prepago que espera comprobante no consulta la RPC del pago único', async () => {
    const { db, calls } = dbWith({ prepay_proof_next_attempt: { data: 1, error: null } })
    expect(await nextProofAttempt(db, 'o', 'u')).toBe(1)
    expect(calls).toEqual(['prepay_proof_next_attempt'])
  })

  it('un pending_yape aceptado obtiene su intento de la RPC del pago único', async () => {
    const { db, calls } = dbWith({
      prepay_proof_next_attempt: NOT_PREPAID,
      delivery_payment_proof_next_attempt: { data: 2, error: null },
    })
    expect(await nextProofAttempt(db, 'o', 'u')).toBe(2)
    expect(calls).toEqual(['prepay_proof_next_attempt', 'delivery_payment_proof_next_attempt'])
  })

  it('si tampoco es pago único, vale la negativa del prepago (409)', async () => {
    const { db } = dbWith({
      prepay_proof_next_attempt: NOT_PREPAID,
      delivery_payment_proof_next_attempt: NOT_SINGLE,
    })
    await expect(nextProofAttempt(db, 'o', 'u')).rejects.toMatchObject({
      code: 'invalid_state_transition',
    })
  })

  it('el tercer intento del pago único es 403', async () => {
    const { db } = dbWith({
      prepay_proof_next_attempt: NOT_PREPAID,
      delivery_payment_proof_next_attempt: {
        data: null,
        error: { code: 'P0001', hint: 'proof_attempts_exhausted', message: 'tope' },
      },
    })
    await expect(nextProofAttempt(db, 'o', 'u')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('registrar: null si no es pago único; replayed se propaga', async () => {
    expect(
      await registerDeliveryPaymentProof(
        dbWith({ register_delivery_payment_proof: NOT_SINGLE }).db,
        'o',
        'u',
        'p',
      ),
    ).toBeNull()
    expect(
      await registerDeliveryPaymentProof(
        dbWith({ register_delivery_payment_proof: { data: { replayed: true }, error: null } }).db,
        'o',
        'u',
        'p',
      ),
    ).toEqual({ replayed: true })
  })
})

describe('deliveryPaymentDomainError', () => {
  it.each([
    ['P0002', undefined, 'not_found'],
    ['P0001', 'proof_attempts_exhausted', 'forbidden'],
    ['P0001', 'order_closed', 'invalid_state_transition'],
    ['P0001', 'payment_already_confirmed', 'invalid_state_transition'],
    ['P0001', 'invalid_proof_path', 'validation_error'],
    ['P0001', 'proof_file_missing', 'validation_error'],
  ])('%s/%s -> %s', (code, hint, expected) => {
    expect(deliveryPaymentDomainError({ code, hint: hint ?? null, message: 'm' })?.code).toBe(
      expected,
    )
  })

  it('un fallo que no es de negocio no se disfraza', () => {
    expect(deliveryPaymentDomainError({ code: '57014', message: 'timeout' })).toBeNull()
    expect(deliveryPaymentDomainError({ code: 'P0001', hint: 'otra', message: 'm' })).toBeNull()
  })
})

describe('prepayTotalText: el total del prepago se suma en céntimos enteros', () => {
  it('suma importe y envío con dos decimales', () => {
    expect(prepayTotalText(12.35, 2)).toBe('14.35')
  })
  it('no arrastra el error de coma flotante de 0.1 + 0.2', () => {
    expect(prepayTotalText(0.1, 0.2)).toBe('0.30')
  })
  it('un envío en cero deja el importe con dos decimales', () => {
    expect(prepayTotalText(10, 0)).toBe('10.00')
  })
  it('acepta cadenas decimales como las que devuelve la base', () => {
    expect(prepayTotalText('12.35', '2.00')).toBe('14.35')
  })
  it('rellena los céntimos menores de diez', () => {
    expect(prepayTotalText(0.05, 0)).toBe('0.05')
  })
  it('respeta el máximo de numeric(10,2)', () => {
    expect(prepayTotalText(99999999.99, 0)).toBe('99999999.99')
  })
  it.each([
    ['NaN', Number.NaN],
    ['null', null],
    ['undefined', undefined],
    ['texto', 'abc'],
    ['cadena vacía', ''],
    ['un importe negativo', -5],
  ])('lanza si el importe es ilegible (%s)', (_nombre, importe) => {
    expect(() => prepayTotalText(importe, 1)).toThrow('Importe del pedido ilegible')
  })
})

describe('prepayProofState: qué puede hacer el cliente con la captura', () => {
  const base = {
    status: 'confirmed',
    payment_intent: 'pending_yape',
    delivery_method: 'delivery',
    proof_attempt: 0,
    payment_proof_status: null,
    payment_verified_at: null,
  }
  const aceptados = [
    'confirmed',
    'preparing',
    'waiting_driver',
    'heading_to_restaurant',
    'waiting_at_restaurant',
    'picked_up',
  ]

  it.each(aceptados)('pago único en %s sin ingreso: admite captura y es opcional', (status) => {
    for (const proof_attempt of [0, 1]) {
      const r = prepayProofState({ ...base, status, proof_attempt })
      expect(r.canUploadProof).toBe(true)
      expect(r.proofOptional).toBe(true)
    }
  })
  it.each(['pending', 'delivered', 'cancelled'])('pago único en %s no admite captura', (status) => {
    const r = prepayProofState({ ...base, status })
    expect(r.canUploadProof).toBe(false)
    expect(r.proofOptional).toBe(true)
  })
  it('con el ingreso ya confirmado no admite captura', () => {
    const r = prepayProofState({ ...base, payment_verified_at: '2026-11-27T10:00:00Z' })
    expect(r.canUploadProof).toBe(false)
  })
  it('con dos intentos gastados no admite captura', () => {
    expect(prepayProofState({ ...base, proof_attempt: 2 }).canUploadProof).toBe(false)
  })
  it('un intento nulo cuenta como cero', () => {
    expect(prepayProofState({ ...base, proof_attempt: null }).canUploadProof).toBe(true)
  })
  it('prepago esperando el pago admite captura y es obligatoria', () => {
    const r = prepayProofState({
      ...base,
      payment_intent: 'prepaid',
      status: 'awaiting_payment',
    })
    expect(r.canUploadProof).toBe(true)
    expect(r.proofOptional).toBe(false)
  })
  it('prepago ya confirmado no admite captura', () => {
    const r = prepayProofState({ ...base, payment_intent: 'prepaid', status: 'confirmed' })
    expect(r.canUploadProof).toBe(false)
  })
  it('pago en efectivo no admite captura ni es opcional', () => {
    const r = prepayProofState({ ...base, payment_intent: 'pending_cash' })
    expect(r.canUploadProof).toBe(false)
    expect(r.proofOptional).toBe(false)
  })
  it('un pending_yape de recojo no es pago único', () => {
    const r = prepayProofState({ ...base, delivery_method: 'pickup' })
    expect(r.proofOptional).toBe(false)
    expect(r.canUploadProof).toBe(false)
  })
  it('paymentVerifiedAt sale en UTC con Z', () => {
    const r = prepayProofState({ ...base, payment_verified_at: '2026-11-27T10:00:00-05:00' })
    expect(r.paymentVerifiedAt).toBe('2026-11-27T15:00:00.000Z')
  })
  it('sin ingreso ni captura, paymentVerifiedAt y paymentProofStatus son null', () => {
    const r = prepayProofState(base)
    expect(r.paymentVerifiedAt).toBeNull()
    expect(r.paymentProofStatus).toBeNull()
  })
})
