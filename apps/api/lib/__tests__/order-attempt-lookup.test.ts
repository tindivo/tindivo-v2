/**
 * GET /customer/orders/attempts/{key} cuando la lectura del registro FALLA: la ruta
 * no puede afirmar `not_found` (no comprobó nada). Responde `unknown`.
 * Sin base: el cliente de servicio y la autenticación se simulan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Resultado = { data: unknown; error: unknown }
const estado: { respuestas: Record<string, Resultado> } = { respuestas: {} }

vi.mock('@/lib/http/auth', () => ({
  requireRole: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => estado.respuestas[tabla],
      }
      return builder
    },
  }),
}))

import { GET } from '../../app/api/v1/customer/orders/attempts/[key]/route'

const KEY = '22222222-2222-4222-8222-222222222222'
const FALLO = { data: null, error: { code: '57014', message: 'timeout' } }
const SIN_FILA = { data: null, error: null }

async function consultar() {
  const res = await GET(new Request(`http://localhost/api/v1/customer/orders/attempts/${KEY}`), {
    params: Promise.resolve({ key: KEY }),
  })
  return { res, body: await res.json() }
}

describe('intentos · la lectura del registro falla', () => {
  beforeEach(() => {
    estado.respuestas = {}
  })

  it('falla la tabla nueva: 200 unknown, nunca not_found', async () => {
    estado.respuestas = { creation_idempotency: FALLO, idempotency_keys: SIN_FILA }
    const { res, body } = await consultar()
    expect(res.status).toBe(200)
    expect(body.data).toEqual({ state: 'unknown', order: null })
  })

  it('falla la legada: 200 unknown, nunca not_found', async () => {
    estado.respuestas = { creation_idempotency: SIN_FILA, idempotency_keys: FALLO }
    const { res, body } = await consultar()
    expect(res.status).toBe(200)
    expect(body.data).toEqual({ state: 'unknown', order: null })
  })

  it('control: sin fallo y sin filas sigue siendo not_found', async () => {
    estado.respuestas = { creation_idempotency: SIN_FILA, idempotency_keys: SIN_FILA }
    const { body } = await consultar()
    expect(body.data).toEqual({ state: 'not_found', order: null })
  })
})
