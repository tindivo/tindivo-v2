import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import { deliveryPaymentDomainError, registerDeliveryPaymentProof } from './delivery-payment'
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
