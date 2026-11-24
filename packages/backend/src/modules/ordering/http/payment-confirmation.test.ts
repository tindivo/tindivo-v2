import { describe, expect, it } from 'vitest'
import type { Deps } from '../../../composition'
import { createLogger } from '../../../shared'
import {
  businessPaymentConfirmationHandler,
  businessPaymentProofRejectHandler,
} from './business-payment'
import { driverPrepayProofHandler } from './driver-payment-proof'

const ORDER_ID = '6f0c4a52-3d1e-4b8a-9c57-2a1f0e9d8b11'
const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000003'

type Row = Record<string, unknown> | null
interface Fake {
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  driver?: Row
  order?: Row
}

function makeDeps(roles: string[], fake: Fake) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const signed: number[] = []
  const table = (row: Row) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
    }),
  })
  const deps = {
    auth: { authenticate: async () => ({ userId: USER_ID, roles, accessToken: 'jwt' }) },
    clock: { now: () => new Date('2026-11-23T12:00:00.000Z') },
    ids: { uuid: () => 'f3b1c2d4-0000-4000-8000-0000000000aa' },
    logger: createLogger({ module: 'test', sink: { write: () => {} } }),
    supabase: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return fake.rpc ? fake.rpc(name, args) : { data: null, error: null }
      },
      from: (t: string) => table(t === 'drivers' ? (fake.driver ?? null) : (fake.order ?? null)),
      storage: {
        from: () => ({
          createSignedUrl: async (_path: string, seconds: number) => {
            signed.push(seconds)
            return { data: { signedUrl: 'https://s/x?token=t' }, error: null }
          },
        }),
      },
    }),
  } as unknown as Deps
  return { deps, calls, signed }
}

const post = (path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('POST /business/orders/{id}/payment-confirmation', () => {
  const req = () => post(`/api/v1/business/orders/${ORDER_ID}/payment-confirmation`)

  it('confirma con el actor autenticado y devuelve el instante en UTC con Z', async () => {
    const { deps, calls } = makeDeps(['business'], {
      rpc: async () => ({
        data: {
          id: ORDER_ID,
          status: 'preparing',
          paymentVerifiedAt: '2026-11-23T07:00:00.123456+00:00',
        },
        error: null,
      }),
    })
    const res = await businessPaymentConfirmationHandler.withDeps(deps)(req(), { id: ORDER_ID })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      id: ORDER_ID,
      status: 'preparing',
      paymentProofStatus: 'verified',
      paymentVerifiedAt: '2026-11-23T07:00:00.123Z',
    })
    expect(calls[0]).toEqual({
      name: 'confirm_delivery_payment',
      args: { p_order_id: ORDER_ID, p_actor_user_id: USER_ID },
    })
  })

  it('quien no es negocio recibe 403 sin tocar la base', async () => {
    const { deps, calls } = makeDeps(['customer'], {})
    const res = await businessPaymentConfirmationHandler.withDeps(deps)(req(), { id: ORDER_ID })
    expect(res.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['P0002', null, 404],
    ['P0001', 'order_closed', 409],
    ['P0001', 'order_not_pending_yape', 409],
  ])('el error %s/%s sale como %i', async (code, hint, status) => {
    const { deps } = makeDeps(['business'], {
      rpc: async () => ({ data: null, error: { code, hint, message: 'x' } }),
    })
    const res = await businessPaymentConfirmationHandler.withDeps(deps)(req(), { id: ORDER_ID })
    expect(res.status).toBe(status)
  })
})

describe('POST /business/orders/{id}/payment-proof/reject', () => {
  const req = (body: unknown) =>
    post(`/api/v1/business/orders/${ORDER_ID}/payment-proof/reject`, body)

  it('manda intento y motivo a la RPC y devuelve los intentos que quedan', async () => {
    const { deps, calls } = makeDeps(['business'], {
      rpc: async () => ({
        data: { id: ORDER_ID, status: 'preparing', attempt: 1, attemptsLeft: 1 },
        error: null,
      }),
    })
    const res = await businessPaymentProofRejectHandler.withDeps(deps)(
      req({ attempt: 1, reasonCode: 'wrong_amount' }),
      { id: ORDER_ID },
    )
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({
      paymentProofStatus: 'rejected',
      attemptsLeft: 1,
    })
    expect(calls[0]?.args).toEqual({
      p_order_id: ORDER_ID,
      p_actor_user_id: USER_ID,
      p_attempt: 1,
      p_reason_code: 'wrong_amount',
    })
  })

  it('un motivo fuera de la lista o un intento 3 es 422 y no llega a la base', async () => {
    const { deps, calls } = makeDeps(['business'], {})
    for (const body of [
      { attempt: 1, reasonCode: 'porque_si' },
      { attempt: 3, reasonCode: 'other' },
    ]) {
      const res = await businessPaymentProofRejectHandler.withDeps(deps)(req(body), {
        id: ORDER_ID,
      })
      expect(res.status).toBe(422)
    }
    expect(calls).toHaveLength(0)
  })

  it('con el ingreso ya confirmado, 409', async () => {
    const { deps } = makeDeps(['business'], {
      rpc: async () => ({
        data: null,
        error: { code: 'P0001', hint: 'payment_already_confirmed', message: 'x' },
      }),
    })
    const res = await businessPaymentProofRejectHandler.withDeps(deps)(
      req({ attempt: 1, reasonCode: 'other' }),
      { id: ORDER_ID },
    )
    expect(res.status).toBe(409)
  })
})

describe('GET /driver/orders/{id}/prepay-proof', () => {
  const req = () =>
    new Request(`http://localhost/api/v1/driver/orders/${ORDER_ID}/prepay-proof`, {
      headers: { authorization: 'Bearer jwt' },
    })
  const mine = {
    driver_id: 'drv-1',
    status: 'heading_to_restaurant',
    payment_intent: 'pending_yape',
    comprobante_prepago_url: 'u/o/attempt-1-x.png',
    payment_proof_status: 'pending',
  }

  it('el motorizado asignado recibe una URL firmada de 120 s', async () => {
    const { deps, signed } = makeDeps(['driver'], { driver: { id: 'drv-1' }, order: mine })
    const res = await driverPrepayProofHandler.withDeps(deps)(req(), { id: ORDER_ID })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({
      expiresInSeconds: 120,
      paymentProofStatus: 'pending',
    })
    expect(signed).toEqual([120])
  })

  it.each([
    ['otro motorizado', { ...mine, driver_id: 'drv-2' }],
    ['pedido entregado', { ...mine, status: 'delivered' }],
    ['pedido cancelado', { ...mine, status: 'cancelled' }],
    ['sin captura', { ...mine, comprobante_prepago_url: null, payment_proof_status: null }],
    ['prepago', { ...mine, payment_intent: 'prepaid' }],
    ['sin pedido', null],
  ])('%s: 404 y no firma nada', async (_name, order) => {
    const { deps, signed } = makeDeps(['driver'], { driver: { id: 'drv-1' }, order })
    const res = await driverPrepayProofHandler.withDeps(deps)(req(), { id: ORDER_ID })
    expect(res.status).toBe(404)
    expect(signed).toHaveLength(0)
  })

  it('quien no es motorizado recibe 403; un usuario sin fila de motorizado, 404', async () => {
    const a = makeDeps(['customer'], {})
    expect((await driverPrepayProofHandler.withDeps(a.deps)(req(), { id: ORDER_ID })).status).toBe(
      403,
    )
    const b = makeDeps(['driver'], { driver: null, order: mine })
    expect((await driverPrepayProofHandler.withDeps(b.deps)(req(), { id: ORDER_ID })).status).toBe(
      404,
    )
  })
})
