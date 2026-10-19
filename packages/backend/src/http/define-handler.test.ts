import { DomainError } from '@tindivo/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Deps } from '../composition'
import type { Actor } from '../modules/identity'
import { createLogger, type LogLevel } from '../shared'
import { defineHandler } from './define-handler'

function makeDeps(options: { roles?: Actor['roles']; ids?: string[] } = {}) {
  const lines: Array<{ level: LogLevel; entry: Record<string, unknown> }> = []
  const ids = [...(options.ids ?? ['generated-id'])]
  let authCalls = 0
  const deps: Deps = {
    auth: {
      authenticate: async (request, requirement) => {
        authCalls++
        const header = request.headers.get('authorization')
        if (!header) throw new DomainError('No autenticado', 'unauthorized')
        const roles = options.roles ?? ['customer']
        if (requirement === 'admin' && !roles.includes('admin')) {
          throw new DomainError("Se requiere el rol 'admin'", 'forbidden')
        }
        return { userId: 'u1', roles, accessToken: header.slice(7) }
      },
    },
    clock: { now: () => new Date('2026-10-19T12:00:00.000Z') },
    devices: {
      register: async () => {
        throw new Error('no se usa en estas pruebas')
      },
      unregister: async () => false,
    },
    ids: { uuid: () => ids.shift() ?? 'extra-id' },
    logger: createLogger({
      module: 'test',
      sink: { write: (level, line) => lines.push({ level, entry: JSON.parse(line) }) },
    }),
    supabase: () => {
      throw new Error('no se usa en estas pruebas')
    },
  }
  return { deps, lines, authCalls: () => authCalls }
}

interface ProblemBody {
  detail?: string
  errors?: Array<{ field: string; message: string }>
}

async function problemOf(res: Response): Promise<ProblemBody> {
  return (await res.json()) as ProblemBody
}

const REQUEST_UUID = '3f2b8c1e-5a4d-4e7f-9b6a-1c2d3e4f5a6b'

const noUser = { module: 'test', method: 'GET', path: '/api/v1/test/ping', auth: 'none' } as const

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/test/ping', {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json', ...headers },
  })
}

describe('defineHandler: autenticación', () => {
  it('auth none no pide token y entrega actor null', async () => {
    const { deps, authCalls } = makeDeps()
    let seen: Actor | null | undefined
    const handler = defineHandler(
      { ...noUser, response: z.object({ ok: z.boolean() }) },
      async ({ actor }) => {
        seen = actor
        return { ok: true }
      },
    ).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(200)
    expect(seen).toBeNull()
    expect(authCalls()).toBe(0)
  })

  it('auth user responde 401 sin token', async () => {
    const { deps } = makeDeps()
    const handler = defineHandler(
      { ...noUser, auth: 'user', response: z.object({ ok: z.boolean() }) },
      async () => ({ ok: true }),
    ).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(await res.json()).toMatchObject({
      code: 'unauthorized',
      status: 401,
      detail: 'No autenticado',
    })
  })

  it('auth user entrega el actor con su token', async () => {
    const { deps } = makeDeps()
    let seen: Actor | null | undefined
    const handler = defineHandler(
      { ...noUser, auth: 'user', response: z.object({ ok: z.boolean() }) },
      async ({ actor }) => {
        seen = actor
        return { ok: true }
      },
    ).withDeps(deps)
    await handler(post('', { authorization: 'Bearer abc' }), {})
    expect(seen).toEqual({ userId: 'u1', roles: ['customer'], accessToken: 'abc' })
  })

  it('auth admin responde 403 si falta el rol y 200 si lo tiene', async () => {
    const spec = { ...noUser, auth: 'admin', response: z.object({ ok: z.boolean() }) } as const
    const forbidden = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)
    const denied = await forbidden(post(''), {})
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ code: 'forbidden' })

    const allowed = defineHandler(spec, async () => ({ ok: true })).withDeps(
      makeDeps({ roles: ['admin'] }).deps,
    )
    expect((await allowed(post(''), {})).status).toBe(200)
  })
})

describe('defineHandler: validación', () => {
  const spec = {
    ...noUser,
    method: 'POST',
    params: z.object({ orderId: z.uuid() }),
    query: z.object({ limit: z.string().regex(/^\d+$/) }),
    body: z.object({ name: z.string().min(1) }),
    response: z.object({ ok: z.boolean() }),
  } as const
  const uuid = '3f0a2c3e-5b1d-4e0c-9d6a-0b7a6f6f2a11'

  it('responde 422 con la forma de handleError cuando fallan params, query o body', async () => {
    const handler = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)

    const badParams = await handler(post('{"name":"a"}'), { orderId: 'no-es-uuid' })
    expect(badParams.status).toBe(422)
    const bodyOfParams = await problemOf(badParams)
    expect(bodyOfParams).toMatchObject({
      type: 'about:blank',
      title: 'validation_error',
      status: 422,
      code: 'validation_error',
      detail: 'La validación de la solicitud falló',
      requestId: 'generated-id',
    })
    expect(bodyOfParams.errors).toEqual([{ field: 'orderId', message: expect.any(String) }])

    const badQuery = await handler(
      new Request('http://localhost/api/v1/test/ping?limit=x', {
        method: 'POST',
        body: '{"name":"a"}',
      }),
      { orderId: uuid },
    )
    expect(badQuery.status).toBe(422)
    expect((await problemOf(badQuery)).errors).toEqual([
      { field: 'limit', message: expect.any(String) },
    ])

    const badBody = await handler(
      new Request('http://localhost/api/v1/test/ping?limit=3', {
        method: 'POST',
        body: '{"name":""}',
      }),
      { orderId: uuid },
    )
    expect(badBody.status).toBe(422)
    expect((await problemOf(badBody)).errors).toEqual([
      { field: 'name', message: expect.any(String) },
    ])
  })

  it('responde 422 si el cuerpo no es JSON', async () => {
    const handler = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)
    const res = await handler(
      new Request('http://localhost/api/v1/test/ping?limit=3', { method: 'POST', body: 'no json' }),
      { orderId: uuid },
    )
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'validation_error' })
  })

  it('entrega a run los valores validados', async () => {
    let seen: unknown
    const handler = defineHandler(spec, async ({ params, query, body }) => {
      seen = { params, query, body }
      return { ok: true }
    }).withDeps(makeDeps().deps)
    const res = await handler(
      new Request('http://localhost/api/v1/test/ping?limit=3', {
        method: 'POST',
        body: '{"name":"a"}',
      }),
      { orderId: uuid },
    )
    expect(res.status).toBe(200)
    expect(seen).toEqual({ params: { orderId: uuid }, query: { limit: '3' }, body: { name: 'a' } })
  })
})

describe('defineHandler: límite de cuerpo', () => {
  const spec = {
    ...noUser,
    method: 'POST',
    body: z.object({ a: z.string() }),
    response: z.object({ ok: z.boolean() }),
    maxBodyBytes: 32,
  } as const

  it('rechaza por content-length sin leer el cuerpo', async () => {
    const handler = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.close()
      },
    })
    const request = new Request('http://localhost/api/v1/test/ping', {
      method: 'POST',
      body: stream,
      headers: { 'content-length': '5000' },
      duplex: 'half',
    } as RequestInit)
    const res = await handler(request, {})
    expect(res.status).toBe(422)
    expect((await problemOf(res)).detail).toContain('32 bytes')
    expect(request.bodyUsed).toBe(false)
  })

  it('corta el stream en cuanto pasa del límite aunque no declare content-length', async () => {
    let pulls = 0
    const handler = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(20))
        if (pulls > 100) controller.close()
      },
    })
    const request = new Request('http://localhost/api/v1/test/ping', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)
    const res = await handler(request, {})
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'validation_error' })
    expect(pulls).toBeLessThan(10)
  })

  it('acepta un cuerpo dentro del límite', async () => {
    const handler = defineHandler(spec, async () => ({ ok: true })).withDeps(makeDeps().deps)
    expect((await handler(post('{"a":"x"}'), {})).status).toBe(200)
  })
})

describe('defineHandler: límite de cuerpo sin esquema y orden con la autenticación', () => {
  const base = {
    ...noUser,
    method: 'POST',
    response: z.object({ ok: z.boolean() }),
    maxBodyBytes: 32,
  } as const

  function streamed(headers: Record<string, string> = {}) {
    const state = { pulls: 0 }
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulls++
          controller.enqueue(new Uint8Array(20))
          if (state.pulls > 100) controller.close()
        },
      },
      // highWaterMark 0: el stream no se adelanta; cada pull es una lectura real del handler.
      { highWaterMark: 0 },
    )
    const request = new Request('http://localhost/api/v1/test/ping', {
      method: 'POST',
      body: stream,
      headers,
      duplex: 'half',
    } as RequestInit)
    return { state, request }
  }

  const variants = [
    ['sin esquema', base],
    ['con esquema', { ...base, body: z.object({ a: z.string() }) }],
  ] as const

  describe.each(variants)('%s', (_name, spec) => {
    it('responde 422 y no ejecuta run si el stream pasa del límite sin content-length', async () => {
      let ran = false
      const handler = defineHandler(spec, async () => {
        ran = true
        return { ok: true }
      }).withDeps(makeDeps().deps)
      const { state, request } = streamed()
      const res = await handler(request, {})
      expect(res.status).toBe(422)
      expect((await problemOf(res)).detail).toContain('32 bytes')
      expect(ran).toBe(false)
      expect(state.pulls).toBeLessThan(10)
    })

    it('responde 422 y no ejecuta run si el content-length miente (menor que el real)', async () => {
      let ran = false
      const handler = defineHandler(spec, async () => {
        ran = true
        return { ok: true }
      }).withDeps(makeDeps().deps)
      const { request } = streamed({ 'content-length': '5' })
      const res = await handler(request, {})
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ code: 'validation_error' })
      expect(ran).toBe(false)
    })
  })

  it('sin esquema, un cuerpo dentro del límite se descarta y run no lo recibe', async () => {
    let seen: unknown = 'sin-llamar'
    const handler = defineHandler(base, async ({ body }) => {
      seen = body
      return { ok: true }
    }).withDeps(makeDeps().deps)
    expect((await handler(post('{"a":"x"}'), {})).status).toBe(200)
    expect(seen).toBeUndefined()
  })

  it('una petición sin token a una ruta con auth responde 401 sin leer el cuerpo', async () => {
    let ran = false
    const handler = defineHandler({ ...base, auth: 'user' }, async () => {
      ran = true
      return { ok: true }
    }).withDeps(makeDeps().deps)
    const { state, request } = streamed()
    const res = await handler(request, {})
    expect(res.status).toBe(401)
    expect(state.pulls).toBe(0)
    expect(request.bodyUsed).toBe(false)
    expect(ran).toBe(false)
  })
})

describe('defineHandler: respuesta', () => {
  it('envuelve en { data } con CORS, request-id y cache-control privado si hay auth', async () => {
    const { deps } = makeDeps()
    const handler = defineHandler(
      { ...noUser, auth: 'user', response: z.object({ ok: z.boolean() }) },
      async () => ({ ok: true }),
    ).withDeps(deps)
    const res = await handler(
      new Request('http://localhost/api/v1/test/ping', {
        headers: {
          authorization: 'Bearer t',
          origin: 'https://negocios.tindivo.com',
          'x-request-id': REQUEST_UUID,
        },
      }),
      {},
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { ok: true } })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://negocios.tindivo.com')
    expect(res.headers.get('x-request-id')).toBe(REQUEST_UUID)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('genera el request-id con IdGenerator y no pone cache-control con auth none', async () => {
    const { deps } = makeDeps({ ids: ['id-77'] })
    const handler = defineHandler(
      { ...noUser, response: z.object({ ok: z.boolean() }) },
      async () => ({ ok: true }),
    ).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.headers.get('x-request-id')).toBe('id-77')
    expect(res.headers.get('cache-control')).toBeNull()
  })

  it("responde 204 sin cuerpo con response 'empty'", async () => {
    const { deps } = makeDeps()
    const handler = defineHandler(
      { ...noUser, auth: 'user', response: 'empty' },
      async () => undefined,
    ).withDeps(deps)
    const res = await handler(post(''), {})
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-request-id')).toBe('generated-id')
  })

  it('fuera de producción, una salida que no cuadra con response da 500 y se registra', async () => {
    const { deps, lines } = makeDeps()
    const handler = defineHandler(
      { ...noUser, response: z.object({ ok: z.boolean() }) },
      // Salida inválida a propósito: `ok` debería ser booleano.
      async () => ({ ok: 'sí' }) as unknown as { ok: boolean },
    ).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ code: 'internal_error' })
    expect(lines.some((l) => l.entry.event === 'invalid_response' && l.level === 'error')).toBe(
      true,
    )
  })
})

describe('defineHandler: errores', () => {
  it('traduce un DomainError al status del contrato con su code', async () => {
    const { deps } = makeDeps()
    const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
      throw new DomainError('El pedido no se puede cancelar', 'order_not_cancellable')
    }).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      code: 'order_not_cancellable',
      detail: 'El pedido no se puede cancelar',
      requestId: 'generated-id',
    })
  })

  it('un error desconocido da 500 internal_error sin filtrar su mensaje y lo registra', async () => {
    const { deps, lines } = makeDeps()
    const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
      throw new Error('fallo con teléfono 987654321')
    }).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('987654321')
    expect(JSON.parse(text)).toMatchObject({
      code: 'internal_error',
      detail: 'Ocurrió un error interno',
    })
    expect(lines.some((l) => l.entry.event === 'unhandled_error' && l.level === 'error')).toBe(true)
  })
})

describe('defineHandler: errores sin datos personales en el log', () => {
  it('no registra el message ni el stack de un error desconocido, ni con cause', async () => {
    const { deps, lines } = makeDeps()
    const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
      const err = new Error('falló +51 987 654 321 juana@example.pe sk_live_abc123', {
        cause: new Error('causa +51 987 654 321 sk_live_abc123'),
      })
      err.name = 'PostgrestError'
      Object.assign(err, { code: '23505' })
      err.stack = `PostgrestError: ${err.message}
    at insertar (/app/repo.ts:10:5)`
      throw err
    }).withDeps(deps)
    const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
    expect(res.status).toBe(500)
    const everything = JSON.stringify(lines) + (await res.text())
    for (const secret of ['987 654 321', 'juana@example.pe', 'sk_live_abc123']) {
      expect(everything).not.toContain(secret)
    }
    const logged = lines.find((l) => l.entry.event === 'unhandled_error')
    expect(logged?.entry.failure).toMatchObject({
      kind: 'error',
      name: 'PostgrestError',
      code: '23505',
      frames: ['repo.ts:10:5'],
    })
  })

  it('un objeto plano o una cadena lanzados en run tampoco dejan su contenido', async () => {
    for (const thrown of [
      { message: 'juana@example.pe sk_live_abc123', details: '+51 987 654 321' },
      'falló +51 987 654 321 juana@example.pe sk_live_abc123',
    ]) {
      const { deps, lines } = makeDeps()
      const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
        throw thrown
      }).withDeps(deps)
      const res = await handler(new Request('http://localhost/api/v1/test/ping'), {})
      expect(res.status).toBe(500)
      const everything = JSON.stringify(lines) + (await res.text())
      for (const secret of ['987 654 321', 'juana@example.pe', 'sk_live_abc123']) {
        expect(everything).not.toContain(secret)
      }
    }
  })
})

describe('defineHandler: cabeceras del cliente', () => {
  const PAYLOAD = '+51 987 654 321 juana@example.pe sk_live_abc123'
  const SECRETS = ['987 654 321', 'juana@example.pe', 'sk_live_abc123']
  const CLIENT_FIELD = {
    'x-tindivo-platform': 'clientPlatform',
    'x-tindivo-app': 'clientApp',
    'x-tindivo-app-version': 'clientAppVersion',
    'x-tindivo-build': 'clientBuild',
  } as const

  async function everythingFrom(res: Response, lines: unknown): Promise<string> {
    const headers = JSON.stringify([...res.headers.entries()])
    return `${JSON.stringify(lines)}${headers}${await res.text()}`
  }

  it.each(
    Object.keys(CLIENT_FIELD),
  )('no deja pasar un texto libre en %s: se registra null y no sale en log, cabeceras ni cuerpo', async (header) => {
    for (const failing of [false, true]) {
      const { deps, lines } = makeDeps()
      const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
        if (failing) throw new DomainError('No disponible', 'forbidden')
        return {}
      }).withDeps(deps)
      const res = await handler(
        new Request('http://localhost/api/v1/test/ping', { headers: { [header]: PAYLOAD } }),
        {},
      )
      const text = await everythingFrom(res, lines)
      for (const secret of SECRETS) expect(text).not.toContain(secret)
      const entry = lines.find((l) => l.entry.event === 'request')?.entry
      const field = CLIENT_FIELD[header as keyof typeof CLIENT_FIELD]
      expect(entry?.[field]).toBeNull()
    }
  })

  it('no deja pasar un texto libre en x-request-id: se genera uno y no sale en ningún sitio', async () => {
    for (const failing of [false, true]) {
      const { deps, lines } = makeDeps({ ids: ['id-gen'] })
      const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => {
        if (failing) throw new Error(`fallo ${PAYLOAD}`)
        return {}
      }).withDeps(deps)
      const res = await handler(
        new Request('http://localhost/api/v1/test/ping', { headers: { 'x-request-id': PAYLOAD } }),
        {},
      )
      expect(res.headers.get('x-request-id')).toBe('id-gen')
      const text = await everythingFrom(res, lines)
      for (const secret of SECRETS) expect(text).not.toContain(secret)
    }
  })

  it.each([
    '987654321',
    'abc-123',
    `x${'a'.repeat(200)}`,
    '',
  ])('rechaza como x-request-id el valor %j porque no es un UUID', async (value) => {
    const { deps } = makeDeps({ ids: ['id-gen'] })
    const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => ({})).withDeps(
      deps,
    )
    const res = await handler(
      new Request('http://localhost/api/v1/test/ping', { headers: { 'x-request-id': value } }),
      {},
    )
    expect(res.headers.get('x-request-id')).toBe('id-gen')
  })

  it('registra los valores válidos del contrato y solo ellos', async () => {
    const { deps, lines } = makeDeps()
    const handler = defineHandler({ ...noUser, response: z.object({}) }, async () => ({})).withDeps(
      deps,
    )
    await handler(
      new Request('http://localhost/api/v1/test/ping', {
        headers: {
          'x-tindivo-platform': 'iOS',
          'x-tindivo-app': 'otra-app',
          'x-tindivo-app-version': '1.2.3.4.5',
          'x-tindivo-build': '12345678901',
        },
      }),
      {},
    )
    expect(lines.find((l) => l.entry.event === 'request')?.entry).toMatchObject({
      clientPlatform: 'ios',
      clientApp: null,
      clientAppVersion: null,
      clientBuild: null,
    })
  })
})

describe('defineHandler: dos identidades', () => {
  const spec = {
    ...noUser,
    auth: 'user',
    method: 'POST',
    params: z.object({ userId: z.string() }),
    query: z.object({ user_id: z.string(), actorUserId: z.string() }),
    body: z.object({ userId: z.string(), user_id: z.string(), actorUserId: z.string() }),
    response: z.object({ ok: z.boolean() }),
  } as const

  /** Autenticador doble que resuelve al actor por token, como el real. */
  function depsByToken() {
    const { deps, lines } = makeDeps()
    const actors: Record<string, Actor> = {
      'tok-a': { userId: 'user-a', roles: ['customer'], accessToken: 'tok-a' },
      'tok-b': { userId: 'user-b', roles: ['driver'], accessToken: 'tok-b' },
    }
    deps.auth = {
      authenticate: async (request) => {
        const token = request.headers.get('authorization')?.slice(7) ?? ''
        const actor = actors[token]
        if (!actor) throw new DomainError('No autenticado', 'unauthorized')
        return actor
      },
    }
    return { deps, lines }
  }

  it('un userId, user_id o actorUserId ajeno en params, query o body no cambia input.actor', async () => {
    const { deps } = depsByToken()
    const seen: Array<Actor | null> = []
    const handler = defineHandler(spec, async ({ actor }) => {
      seen.push(actor)
      return { ok: true }
    }).withDeps(deps)
    const res = await handler(
      new Request('http://localhost/api/v1/test/ping?user_id=user-b&actorUserId=user-b', {
        method: 'POST',
        body: JSON.stringify({ userId: 'user-b', user_id: 'user-b', actorUserId: 'user-b' }),
        headers: { authorization: 'Bearer tok-a' },
      }),
      { userId: 'user-b' },
    )
    expect(res.status).toBe(200)
    expect(seen).toEqual([{ userId: 'user-a', roles: ['customer'], accessToken: 'tok-a' }])
  })

  it('dos peticiones seguidas con tokens distintos entregan actores distintos', async () => {
    const { deps } = depsByToken()
    const seen: Array<string | undefined> = []
    const handler = defineHandler(spec, async ({ actor }) => {
      seen.push(actor?.userId)
      return { ok: true }
    }).withDeps(deps)
    const call = (token: string) =>
      handler(
        new Request('http://localhost/api/v1/test/ping?user_id=x&actorUserId=x', {
          method: 'POST',
          body: JSON.stringify({ userId: 'x', user_id: 'x', actorUserId: 'x' }),
          headers: { authorization: `Bearer ${token}` },
        }),
        { userId: 'x' },
      )
    await call('tok-a')
    await call('tok-b')
    await call('tok-a')
    expect(seen).toEqual(['user-a', 'user-b', 'user-a'])
  })
})

describe('defineHandler: registro y definición', () => {
  it('registra una línea por petición con method, path, status, durationMs y cabeceras de cliente', async () => {
    const { deps, lines } = makeDeps()
    const handler = defineHandler(
      { ...noUser, response: z.object({ ok: z.boolean() }) },
      async () => ({ ok: true }),
    ).withDeps(deps)
    await handler(
      new Request('http://localhost/api/v1/test/ping', {
        headers: {
          'x-tindivo-platform': 'android',
          'x-tindivo-app': 'customer',
          'x-tindivo-app-version': '1.2.3',
          'x-tindivo-build': '42',
        },
      }),
      {},
    )
    const requests = lines.filter((l) => l.entry.event === 'request')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.entry).toMatchObject({
      module: 'test',
      method: 'GET',
      path: '/api/v1/test/ping',
      status: 200,
      requestId: 'generated-id',
      clientPlatform: 'android',
      clientApp: 'customer',
      clientAppVersion: '1.2.3',
      clientBuild: '42',
    })
    expect(typeof requests[0]?.entry.durationMs).toBe('number')
  })

  it('expone la spec', () => {
    const spec = { ...noUser, response: 'empty' } as const
    expect(defineHandler(spec, async () => undefined).spec).toBe(spec)
  })

  it('lanza al definirse si pide idempotent o rateLimit, que aún no existen', () => {
    expect(() =>
      defineHandler({ ...noUser, response: 'empty', idempotent: true }, async () => undefined),
    ).toThrow(/idempotent/)
    expect(() =>
      defineHandler(
        { ...noUser, response: 'empty', rateLimit: { limit: 5, windowSeconds: 60 } },
        async () => undefined,
      ),
    ).toThrow(/rateLimit/)
  })
})
