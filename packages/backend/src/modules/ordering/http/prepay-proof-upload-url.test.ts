import { describe, expect, it } from 'vitest'
import type { Deps } from '../../../composition'
import { createLogger } from '../../../shared'
import { prepayProofUploadUrlHandler } from './prepay-proof-upload-url'

const ORDER_ID = '6f0c4a52-3d1e-4b8a-9c57-2a1f0e9d8b11'
const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000003'
const SECRET_TOKEN = 'eyJSECRET.TOKEN-ficticio.firma-ficticia'
const SECRET_URL = `https://storage.local/object/upload/sign/payment-proofs/x.png?token=${SECRET_TOKEN}`
const LEAKY = `fallo con ${SECRET_URL} y service_role=sk_clave_ficticia_999`

type StorageResult = { data: unknown; error: unknown }

function makeDeps(storage: () => Promise<StorageResult>) {
  const lines: string[] = []
  const deps = {
    auth: {
      authenticate: async () => ({ userId: USER_ID, roles: ['customer'], accessToken: 'jwt' }),
    },
    clock: { now: () => new Date('2026-10-29T12:00:00.000Z') },
    ids: { uuid: () => 'f3b1c2d4-0000-4000-8000-0000000000aa' },
    logger: createLogger({ module: 'test', sink: { write: (_level, line) => lines.push(line) } }),
    supabase: () => ({
      rpc: async () => ({ data: 1, error: null }),
      storage: { from: () => ({ createSignedUploadUrl: storage }) },
    }),
  } as unknown as Deps
  return { deps, lines }
}

function request() {
  return new Request(
    `http://localhost/api/v1/customer/orders/${ORDER_ID}/prepay-proof/upload-url`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/png' }),
    },
  )
}

function expectNoSecrets(text: string) {
  for (const secret of [SECRET_TOKEN, SECRET_URL, 'sk_clave_ficticia_999', 'fallo con']) {
    expect(text).not.toContain(secret)
  }
}

describe('prepayProofUploadUrlHandler: errores y logs sin secretos', () => {
  it('Storage falla con un mensaje que lleva token y URL: ni la respuesta ni el log los llevan', async () => {
    const { deps, lines } = makeDeps(async () => ({
      data: null,
      error: Object.assign(new Error(LEAKY), { name: 'StorageApiError' }),
    }))
    const res = await prepayProofUploadUrlHandler.withDeps(deps)(request(), { id: ORDER_ID })
    const body = await res.text()
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(JSON.parse(body).detail).toBe('Ocurrió un error interno')
    expectNoSecrets(body)
    expect(lines.some((l) => l.includes('unhandled_error'))).toBe(true)
    expectNoSecrets(lines.join('\n'))
  })

  it('el SDK lanza una excepción con el token en el mensaje: tampoco se filtra', async () => {
    const { deps, lines } = makeDeps(async () => {
      throw new Error(LEAKY)
    })
    const res = await prepayProofUploadUrlHandler.withDeps(deps)(request(), { id: ORDER_ID })
    const body = await res.text()
    expect(res.status).toBe(500)
    expectNoSecrets(body)
    expectNoSecrets(lines.join('\n'))
  })

  it('éxito: la respuesta lleva URL y token por diseño, pero el log no', async () => {
    const { deps, lines } = makeDeps(async () => ({
      data: { signedUrl: SECRET_URL, token: SECRET_TOKEN, path: 'ruta' },
      error: null,
    }))
    const res = await prepayProofUploadUrlHandler.withDeps(deps)(request(), { id: ORDER_ID })
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).toContain(SECRET_TOKEN)
    expect(body).toContain(SECRET_URL)
    expect(lines.some((l) => l.includes('"event":"request"'))).toBe(true)
    expectNoSecrets(lines.join('\n'))
  })
})
