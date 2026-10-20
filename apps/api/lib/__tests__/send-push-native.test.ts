import { readFileSync } from 'node:fs'
import { NativePushPayloadSchema } from '@tindivo/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apnsJwt,
  buildApnsRequest,
  buildFcmMessage,
  classifyApns,
  classifyFcm,
  fcmAccessToken,
  loadNativeConfig,
  NativeAuthError,
  type NativeConfig,
  type NativeDevice,
  type NativeFetch,
  type NativeNote,
  nativeDeviceFilter,
  nativePayload,
  sendNative,
} from '../../../../supabase/functions/send-push/native.ts'

// ── Claves de prueba y dobles ───────────────────────────────────────────────

function toPem(der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`
}

async function ecKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  return {
    pem: toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    pub: pair.publicKey,
  }
}

async function rsaKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  return {
    pem: toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    pub: pair.publicKey,
  }
}

const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))

function decodeJwt(jwt: string) {
  const [h, p, s] = jwt.split('.')
  if (!h || !p || !s) throw new Error('JWT mal formado')
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>,
    signature: b64urlToBytes(s),
    input: new TextEncoder().encode(`${h}.${p}`),
  }
}

type Call = { url: string; headers: Record<string, string>; body: string }
type Reply = { status: number; body?: string } | Error

/** `fetch` doble: devuelve la respuesta de `reply(url)` y apunta cada llamada. */
function fakeFetch(reply: (url: string) => Reply) {
  const calls: Call[] = []
  const fn: NativeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body })
    const r = reply(url)
    if (r instanceof Error) throw r
    return { status: r.status, text: async () => r.body ?? '' }
  }
  return { fn, calls }
}

const TOKEN_URI = 'https://oauth2.example.test/token'
const SECRET_TOKEN_IOS = 'a'.repeat(64)
const SECRET_TOKEN_ANDROID = 'fcm-device-token-SUPER-SECRETO-1234567890:APA91b'

const note: NativeNote = {
  title: 'Nuevo pedido #AB2C3D4E · S/ 25.00',
  body: 'Marco · acéptalo antes de que se cancele',
  tag: 'OrderCreated-AB2C3D4E',
  url: '/pedido/AB2C3D4E',
}

async function fullEnv() {
  const ec = await ecKeys()
  const rsa = await rsaKeys()
  const env: Record<string, string> = {
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'tindivo-test',
      client_email: 'push@tindivo-test.iam.gserviceaccount.com',
      private_key: rsa.pem,
      token_uri: TOKEN_URI,
    }),
    APNS_KEY_P8: ec.pem,
    APNS_KEY_ID: 'ABC123DEFG',
    APNS_TEAM_ID: 'TEAM123456',
    APNS_TOPICS_JSON: JSON.stringify({
      customer: 'com.tindivo.customer',
      motorizados: 'com.tindivo.driver',
    }),
  }
  return { env, ecPub: ec.pub, rsaPub: rsa.pub }
}

async function load(env: Record<string, string>, log: (l: string) => void = () => {}) {
  return loadNativeConfig((k) => env[k], log)
}

const ios = (extra: Partial<NativeDevice> = {}): NativeDevice => ({
  token: SECRET_TOKEN_IOS,
  platform: 'ios',
  environment: 'production',
  ...extra,
})
const android: NativeDevice = {
  token: SECRET_TOKEN_ANDROID,
  platform: 'android',
  environment: 'production',
}

const FCM_OK = { status: 200, body: JSON.stringify({ name: 'projects/x/messages/1' }) }
const ACCESS = {
  status: 200,
  body: JSON.stringify({ access_token: 'ya29.TOKEN-DE-ACCESO', expires_in: 3600 }),
}

afterEach(() => vi.restoreAllMocks())

// ── Payload y constructores ─────────────────────────────────────────────────

describe('send-push native · payload v1 y mensajes', () => {
  it('nativePayload cumple el esquema del contrato (CLI-8)', () => {
    const notes: NativeNote[] = [
      note,
      { ...note, url: '/' },
      {
        title: 'Entrega nueva',
        body: '',
        tag: 'CourierStepped-requested-ZZ9Y8X7W',
        url: '/entrega/3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
      },
    ]
    for (const n of notes) {
      const p = nativePayload(n, 'OrderCreated')
      expect(NativePushPayloadSchema.parse(p)).toEqual(p)
      expect(p).toEqual({
        v: 1,
        type: 'OrderCreated',
        tag: n.tag,
        title: n.title,
        body: n.body,
        deepLink: n.url,
      })
    }
  })

  it('un deepLink con host o protocolo-relativo no cumple el contrato', () => {
    const p = nativePayload(note, 'OrderCreated')
    expect(NativePushPayloadSchema.safeParse({ ...p, deepLink: 'https://x.test/a' }).success).toBe(
      false,
    )
    expect(NativePushPayloadSchema.safeParse({ ...p, deepLink: '//x.test/a' }).success).toBe(false)
    expect(NativePushPayloadSchema.safeParse({ ...p, v: 2 }).success).toBe(false)
  })

  it('buildFcmMessage: notification, data como texto y ajustes de Android', () => {
    const p = nativePayload(note, 'OrderCreated')
    const m = buildFcmMessage(SECRET_TOKEN_ANDROID, p)
    expect(m.message.token).toBe(SECRET_TOKEN_ANDROID)
    expect(m.message.notification).toEqual({ title: note.title, body: note.body })
    expect(m.message.data).toEqual({
      v: '1',
      type: 'OrderCreated',
      tag: note.tag,
      title: note.title,
      body: note.body,
      deepLink: note.url,
    })
    for (const v of Object.values(m.message.data)) expect(typeof v).toBe('string')
    expect(m.message.android).toEqual({
      priority: 'HIGH',
      collapse_key: note.tag,
      notification: { tag: note.tag, channel_id: 'order_updates' },
    })
  })

  it('buildApnsRequest: producción, cabeceras y cuerpo', () => {
    const p = nativePayload(note, 'OrderCreated')
    const r = buildApnsRequest(ios(), p, 'com.tindivo.customer')
    expect(r.url).toBe(`https://api.push.apple.com/3/device/${SECRET_TOKEN_IOS}`)
    expect(r.headers).toMatchObject({
      'apns-topic': 'com.tindivo.customer',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': note.tag,
    })
    expect(JSON.parse(r.body)).toEqual({
      aps: {
        alert: { title: note.title, body: note.body },
        sound: 'default',
        'thread-id': note.tag,
      },
      v: 1,
      type: 'OrderCreated',
      tag: note.tag,
      deepLink: note.url,
    })
  })

  it('buildApnsRequest: sandbox va a su host y un tag largo se recorta a 64 bytes', () => {
    const tag = `TransferResolved-expired-from-${crypto.randomUUID()}`
    expect(new TextEncoder().encode(tag).length).toBeGreaterThan(64)
    const p = nativePayload({ ...note, tag }, 'TransferResolved')
    const r = buildApnsRequest(ios({ environment: 'sandbox' }), p, 'com.tindivo.customer')
    expect(r.url.startsWith('https://api.sandbox.push.apple.com/3/device/')).toBe(true)
    const id = r.headers['apns-collapse-id'] ?? ''
    expect(new TextEncoder().encode(id).length).toBeLessThanOrEqual(64)
    expect(tag.startsWith(id)).toBe(true)
    expect(JSON.parse(r.body).tag).toBe(tag) // el tag completo viaja en el cuerpo
  })
})

// ── Clasificación ───────────────────────────────────────────────────────────

describe('send-push native · clasificación', () => {
  it.each([
    [200, undefined, 'ok'],
    [410, 'Unregistered', 'invalid_token'],
    [410, undefined, 'invalid_token'],
    [400, 'BadDeviceToken', 'invalid_token'],
    [400, 'DeviceTokenNotForTopic', 'invalid_token'],
    [400, 'BadTopic', 'failed'],
    [400, 'PayloadTooLarge', 'failed'],
    [403, 'ExpiredProviderToken', 'failed'],
    [429, 'TooManyRequests', 'failed'],
    [500, 'InternalServerError', 'failed'],
    [503, 'ServiceUnavailable', 'failed'],
  ] as const)('APNs %s %s -> %s', (status, reason, expected) => {
    expect(classifyApns(status, reason)).toBe(expected)
  })

  it.each([
    [200, null, 'ok'],
    [404, 'UNREGISTERED', 'invalid_token'],
    [400, 'INVALID_ARGUMENT', 'invalid_token'],
    [404, 'NOT_FOUND', 'failed'],
    [400, 'INVALID_ARGUMENT_OTHER', 'failed'],
    [401, 'UNAUTHENTICATED', 'failed'],
    [403, 'SENDER_ID_MISMATCH', 'failed'],
    [429, 'QUOTA_EXCEEDED', 'failed'],
    [500, 'INTERNAL', 'failed'],
    [503, 'UNAVAILABLE', 'failed'],
  ] as const)('FCM %s %s -> %s', (status, errorStatus, expected) => {
    expect(classifyFcm(status, errorStatus)).toBe(expected)
  })
})

// ── JWT ES256 de APNs ───────────────────────────────────────────────────────

describe('send-push native · JWT ES256 de APNs', () => {
  it('firma con la clave .p8, lleva kid e iss, y la firma se verifica', async () => {
    const { env, ecPub } = await fullEnv()
    const cfg = await load(env)
    expect(cfg.apns).not.toBeNull()
    if (!cfg.apns) return
    const now = Date.UTC(2026, 9, 19, 12, 0, 0)
    const jwt = await apnsJwt(cfg.apns, now)
    const d = decodeJwt(jwt)
    expect(d.header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' })
    expect(d.claims).toEqual({ iss: 'TEAM123456', iat: Math.floor(now / 1000) })
    expect(d.signature.length).toBe(64) // r||s crudo, como pide JWT
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      ecPub,
      d.signature,
      d.input,
    )
    expect(ok).toBe(true)
  })

  it('se cachea hasta 50 minutos y después se renueva', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    if (!cfg.apns) throw new Error('APNs apagado')
    const t0 = Date.UTC(2026, 9, 19, 12, 0, 0)
    const a = await apnsJwt(cfg.apns, t0)
    expect(await apnsJwt(cfg.apns, t0 + 49 * 60_000)).toBe(a)
    const b = await apnsJwt(cfg.apns, t0 + 50 * 60_000)
    expect(b).not.toBe(a)
    expect(decodeJwt(b).claims.iat).toBe(Math.floor((t0 + 50 * 60_000) / 1000))
    expect(await apnsJwt(cfg.apns, t0 + 60 * 60_000)).toBe(b)
  })
})

// ── Token de acceso de FCM ──────────────────────────────────────────────────

describe('send-push native · token de acceso de FCM (RS256)', () => {
  it('la aserción es RS256, lleva scope/aud/iss y su firma se verifica', async () => {
    const { env, rsaPub } = await fullEnv()
    const cfg = await load(env)
    if (!cfg.fcm) throw new Error('FCM apagado')
    const f = fakeFetch(() => ACCESS)
    const now = Date.UTC(2026, 9, 19, 12, 0, 0)
    expect(await fcmAccessToken(cfg.fcm, now, f.fn)).toBe('ya29.TOKEN-DE-ACCESO')
    expect(f.calls).toHaveLength(1)
    const call = f.calls[0]
    expect(call?.url).toBe(TOKEN_URI)
    const form = new URLSearchParams(call?.body)
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const d = decodeJwt(form.get('assertion') ?? '')
    expect(d.header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(d.claims).toEqual({
      iss: 'push@tindivo-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URI,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    })
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      rsaPub,
      d.signature,
      d.input,
    )
    expect(ok).toBe(true)
  })

  it('se cachea hasta 5 minutos antes de vencer y luego se renueva', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    if (!cfg.fcm) throw new Error('FCM apagado')
    let n = 0
    const f = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ access_token: `tok-${++n}`, expires_in: 3600 }),
    }))
    const t0 = Date.UTC(2026, 9, 19, 12, 0, 0)
    expect(await fcmAccessToken(cfg.fcm, t0, f.fn)).toBe('tok-1')
    expect(await fcmAccessToken(cfg.fcm, t0 + 54 * 60_000, f.fn)).toBe('tok-1')
    expect(f.calls).toHaveLength(1)
    expect(await fcmAccessToken(cfg.fcm, t0 + 55 * 60_000, f.fn)).toBe('tok-2')
    expect(f.calls).toHaveLength(2)
  })

  it('un fallo del endpoint de token no filtra el cuerpo: solo un código', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    if (!cfg.fcm) throw new Error('FCM apagado')
    const f = fakeFetch(() => ({
      status: 400,
      body: '{"error":"invalid_grant","detalle":"SECRETO-EN-EL-CUERPO"}',
    }))
    const err = await fcmAccessToken(cfg.fcm, 1, f.fn).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NativeAuthError)
    expect(String((err as Error).message)).not.toContain('SECRETO')
    expect((err as NativeAuthError).code).toBe('auth_http_400')
  })
})

// ── Configuración: cada plataforma por separado ─────────────────────────────

describe('send-push native · configuración (TS-9, OPS-3)', () => {
  it('con todo configurado, ambas plataformas arrancan y no hay logs', async () => {
    const { env } = await fullEnv()
    const lines: string[] = []
    const cfg = await load(env, (l) => lines.push(l))
    expect(cfg.fcm).not.toBeNull()
    expect(cfg.apns).not.toBeNull()
    expect(lines).toEqual([])
  })

  it('sin secretos de FCM, solo FCM se apaga (y deja una línea con la plataforma)', async () => {
    const { env } = await fullEnv()
    env.FCM_SERVICE_ACCOUNT_JSON = ''
    const lines: string[] = []
    const cfg = await load(env, (l) => lines.push(l))
    expect(cfg.fcm).toBeNull()
    expect(cfg.apns).not.toBeNull()
    expect(lines).toEqual([JSON.stringify({ event: 'native_push_disabled', platform: 'fcm' })])
  })

  it('sin secretos de APNs, solo APNs se apaga', async () => {
    const { env } = await fullEnv()
    delete env.APNS_KEY_P8
    const lines: string[] = []
    const cfg = await load(env, (l) => lines.push(l))
    expect(cfg.apns).toBeNull()
    expect(cfg.fcm).not.toBeNull()
    expect(lines).toEqual([JSON.stringify({ event: 'native_push_disabled', platform: 'apns' })])
  })

  it('sin nada configurado, ambas apagadas y sin lanzar', async () => {
    const lines: string[] = []
    const cfg = await load({}, (l) => lines.push(l))
    expect(cfg).toEqual({ fcm: null, apns: null })
    expect(lines).toHaveLength(2)
  })

  it('valores inválidos apagan su plataforma sin filtrar el valor en el log', async () => {
    const { env } = await fullEnv()
    const casos: Array<[string, Record<string, string>, 'fcm' | 'apns']> = [
      ['JSON roto', { FCM_SERVICE_ACCOUNT_JSON: '{SECRETO-JSON-ROTO' }, 'fcm'],
      [
        'clave privada que no es PEM',
        {
          FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
            project_id: 'tindivo-test',
            client_email: 'a@b.test',
            private_key: 'SECRETO-NO-ES-PEM',
          }),
        },
        'fcm',
      ],
      [
        'token_uri sin https',
        {
          FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
            project_id: 'tindivo-test',
            client_email: 'a@b.test',
            private_key: 'x',
            token_uri: 'http://SECRETO.test/token',
          }),
        },
        'fcm',
      ],
      ['.p8 inválida', { APNS_KEY_P8: 'SECRETO-P8-INVALIDA' }, 'apns'],
      ['keyId inválido', { APNS_KEY_ID: 'SECRETO' }, 'apns'],
      ['topics: JSON roto', { APNS_TOPICS_JSON: '{SECRETO' }, 'apns'],
      ['topics: app desconocida', { APNS_TOPICS_JSON: '{"admin":"com.tindivo.admin"}' }, 'apns'],
      ['topics: vacío', { APNS_TOPICS_JSON: '{}' }, 'apns'],
    ]
    for (const [, override, off] of casos) {
      const lines: string[] = []
      const cfg = await load({ ...env, ...override }, (l) => lines.push(l))
      expect(cfg[off]).toBeNull()
      expect(cfg[off === 'fcm' ? 'apns' : 'fcm']).not.toBeNull()
      expect(lines).toEqual([JSON.stringify({ event: 'native_push_disabled', platform: off })])
      expect(lines.join('')).not.toContain('SECRETO')
    }
  })

  it('acepta la .p8 con el texto literal \\n (secreto de una sola línea)', async () => {
    const { env } = await fullEnv()
    env.APNS_KEY_P8 = (env.APNS_KEY_P8 ?? '').trim().replace(/\n/g, '\\n')
    expect((await load(env)).apns).not.toBeNull()
  })
})

// ── Envío: una plataforma sin configuración no se usa y la otra sí ──────────

async function deps(cfg: NativeConfig, f: ReturnType<typeof fakeFetch>) {
  return { config: cfg, fetch: f.fn, now: () => Date.UTC(2026, 9, 19, 12, 0, 0) }
}

describe('send-push native · envío', () => {
  it('iOS: manda a APNs con el JWT, el topic de la app y devuelve ok', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status: 200 }))
    const r = await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f))
    expect(r).toEqual({ channel: 'apns', outcome: 'ok', status: 200, reason: null })
    expect(f.calls).toHaveLength(1)
    const c = f.calls[0]
    expect(c?.url).toBe(`https://api.push.apple.com/3/device/${SECRET_TOKEN_IOS}`)
    expect(c?.headers['apns-topic']).toBe('com.tindivo.customer')
    expect(c?.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('Android: pide el token de acceso y manda a FCM v1', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch((url) => (url === TOKEN_URI ? ACCESS : FCM_OK))
    const r = await sendNative(android, 'motorizados', note, 'OrderCreated', await deps(cfg, f))
    expect(r).toEqual({ channel: 'fcm', outcome: 'ok', status: 200, reason: null })
    expect(f.calls.map((c) => c.url)).toEqual([
      TOKEN_URI,
      'https://fcm.googleapis.com/v1/projects/tindivo-test/messages:send',
    ])
    expect(f.calls[1]?.headers.authorization).toBe('Bearer ya29.TOKEN-DE-ACCESO')
    expect(JSON.parse(f.calls[1]?.body ?? '{}').message.token).toBe(SECRET_TOKEN_ANDROID)
  })

  it('sin FCM, Android no se usa (sin llamadas) y iOS sí', async () => {
    const { env } = await fullEnv()
    env.FCM_SERVICE_ACCOUNT_JSON = ''
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status: 200 }))
    expect(
      await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f)),
    ).toBeNull()
    expect(f.calls).toHaveLength(0)
    expect(
      (await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f)))?.outcome,
    ).toBe('ok')
    expect(f.calls).toHaveLength(1)
    expect(nativeDeviceFilter({ userId: 'u', app: 'customer' }, cfg)?.platforms).toEqual(['ios'])
  })

  it('sin APNs, iOS no se usa (sin llamadas) y Android sí', async () => {
    const { env } = await fullEnv()
    env.APNS_KEY_ID = ''
    const cfg = await load(env)
    const f = fakeFetch((url) => (url === TOKEN_URI ? ACCESS : FCM_OK))
    expect(await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f))).toBeNull()
    expect(f.calls).toHaveLength(0)
    expect(
      (await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f)))?.outcome,
    ).toBe('ok')
    expect(nativeDeviceFilter({ userId: 'u', app: 'customer' }, cfg)?.platforms).toEqual([
      'android',
    ])
  })

  it('sin ninguna plataforma no hay nada que leer ni enviar', async () => {
    const cfg = await load({})
    const f = fakeFetch(() => ({ status: 200 }))
    expect(nativeDeviceFilter({ userId: 'u', app: 'customer' }, cfg)).toBeNull()
    expect(await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f))).toBeNull()
    expect(
      await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f)),
    ).toBeNull()
    expect(f.calls).toHaveLength(0)
  })

  it('una app sin bundle id en APNs_TOPICS_JSON no recibe por APNs', async () => {
    const { env } = await fullEnv() // solo customer y motorizados
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status: 200 }))
    expect(await sendNative(ios(), 'negocios', note, 'OrderCreated', await deps(cfg, f))).toBeNull()
    expect(f.calls).toHaveLength(0)
  })

  it('los avisos de admin no van a dispositivos', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status: 200 }))
    expect(nativeDeviceFilter({ userId: 'u', app: 'admin' }, cfg)).toBeNull()
    expect(await sendNative(ios(), 'admin', note, 'OpsAlert', await deps(cfg, f))).toBeNull()
    expect(await sendNative(android, 'admin', note, 'OpsAlert', await deps(cfg, f))).toBeNull()
    expect(f.calls).toHaveLength(0)
  })

  it('un usuario con dos roles solo recibe en la app del aviso', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const comoCliente = nativeDeviceFilter({ userId: 'u1', app: 'customer' }, cfg)
    const comoMoto = nativeDeviceFilter({ userId: 'u1', app: 'motorizados' }, cfg)
    expect(comoCliente).toEqual({ userId: 'u1', app: 'customer', platforms: ['ios', 'android'] })
    expect(comoMoto).toEqual({ userId: 'u1', app: 'motorizados', platforms: ['ios', 'android'] })
    // La consulta de send-push usa `app = filter.app`: el filtro no mezcla las apps.
    expect(comoCliente?.app).not.toBe(comoMoto?.app)
  })

  it('el APNs de sandbox va a su host', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status: 200 }))
    await sendNative(
      ios({ environment: 'sandbox' }),
      'customer',
      note,
      'OrderCreated',
      await deps(cfg, f),
    )
    expect(f.calls[0]?.url.startsWith('https://api.sandbox.push.apple.com/')).toBe(true)
  })

  it('un 403 ExpiredProviderToken descarta el JWT en caché', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    let status = 403
    const f = fakeFetch(() => ({ status, body: '{"reason":"ExpiredProviderToken"}' }))
    const d = await deps(cfg, f)
    const r1 = await sendNative(ios(), 'customer', note, 'OrderCreated', d)
    expect(r1).toEqual({
      channel: 'apns',
      outcome: 'failed',
      status: 403,
      reason: 'ExpiredProviderToken',
    })
    status = 200
    await sendNative(ios(), 'customer', note, 'OrderCreated', { ...d, now: () => d.now() + 1000 })
    const first = f.calls[0]?.headers.authorization
    const second = f.calls[1]?.headers.authorization
    expect(first).not.toBe(second) // se firmó uno nuevo, no se reusó el rechazado
  })
})

// ── Resultados por código y que nada sensible se escapa ─────────────────────

describe('send-push native · resultados y secretos', () => {
  const RESPUESTAS_APNS: Array<[number, string, string, string]> = [
    [410, '{"reason":"Unregistered"}', 'invalid_token', 'Unregistered'],
    [400, '{"reason":"BadDeviceToken"}', 'invalid_token', 'BadDeviceToken'],
    [400, '{"reason":"DeviceTokenNotForTopic"}', 'invalid_token', 'DeviceTokenNotForTopic'],
    [429, '{"reason":"TooManyRequests"}', 'failed', 'TooManyRequests'],
    [500, 'no es json', 'failed', 'http_500'],
  ]
  it.each(RESPUESTAS_APNS)('APNs %s -> %s con razón %s', async (status, body, outcome, reason) => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch(() => ({ status, body }))
    const r = await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f))
    expect(r).toEqual({ channel: 'apns', outcome, status, reason })
  })

  const fcmBody = (status: string, errorCode?: string, message = 'x') =>
    JSON.stringify({
      error: {
        code: 0,
        message,
        status,
        ...(errorCode
          ? {
              details: [
                { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode },
              ],
            }
          : {}),
      },
    })
  const RESPUESTAS_FCM: Array<[number, string, string, string]> = [
    [404, fcmBody('NOT_FOUND', 'UNREGISTERED'), 'invalid_token', 'UNREGISTERED'],
    [
      400,
      fcmBody(
        'INVALID_ARGUMENT',
        'INVALID_ARGUMENT',
        'The registration token is not a valid FCM registration token',
      ),
      'invalid_token',
      'INVALID_ARGUMENT',
    ],
    [
      400,
      fcmBody('INVALID_ARGUMENT', undefined, 'Invalid JSON payload received'),
      'failed',
      'INVALID_ARGUMENT_OTHER',
    ],
    [
      404,
      fcmBody('NOT_FOUND', undefined, 'Requested entity was not found.'),
      'failed',
      'NOT_FOUND',
    ],
    [429, fcmBody('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), 'failed', 'QUOTA_EXCEEDED'],
    [503, 'html de error', 'failed', 'http_503'],
  ]
  it.each(RESPUESTAS_FCM)('FCM %s -> %s con razón %s', async (status, body, outcome, reason) => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const f = fakeFetch((url) => (url === TOKEN_URI ? ACCESS : { status, body }))
    const r = await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f))
    expect(r).toEqual({ channel: 'fcm', outcome, status, reason })
  })

  it('timeout y error de red: sin estado y con un código fijo', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const timeout = Object.assign(new Error(`abortado ${SECRET_TOKEN_IOS}`), {
      name: 'TimeoutError',
    })
    const f1 = fakeFetch(() => timeout)
    expect(await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f1))).toEqual({
      channel: 'apns',
      outcome: 'failed',
      status: null,
      reason: 'timeout',
    })
    const f2 = fakeFetch((url) =>
      url === TOKEN_URI ? ACCESS : new Error(`ECONNRESET ${SECRET_TOKEN_ANDROID}`),
    )
    expect(
      await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f2)),
    ).toEqual({
      channel: 'fcm',
      outcome: 'failed',
      status: null,
      reason: 'network_error',
    })
  })

  it('cada llamada lleva su timeout de 10 s', async () => {
    const { env } = await fullEnv()
    const cfg = await load(env)
    const spy = vi.spyOn(AbortSignal, 'timeout')
    const f = fakeFetch((url) => (url === TOKEN_URI ? ACCESS : FCM_OK))
    await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f))
    await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f))
    expect(spy).toHaveBeenCalledTimes(3) // token de Google, FCM y APNs
    for (const call of spy.mock.calls) expect(call[0]).toBe(10_000)
  })

  it('ni los resultados ni los logs llevan tokens, secretos o cuerpos de respuesta', async () => {
    const { env } = await fullEnv()
    const logs: string[] = []
    const consola = [
      vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' '))),
      vi.spyOn(console, 'warn').mockImplementation((...a) => void logs.push(a.join(' '))),
      vi.spyOn(console, 'error').mockImplementation((...a) => void logs.push(a.join(' '))),
      vi.spyOn(console, 'info').mockImplementation((...a) => void logs.push(a.join(' '))),
    ]
    const cfg = await load(env, (l) => logs.push(l))
    const CUERPO = `{"reason":"BadDeviceToken","detalle":"CUERPO-SECRETO ${SECRET_TOKEN_IOS} ${SECRET_TOKEN_ANDROID} ya29.TOKEN-DE-ACCESO"}`
    const resultados: unknown[] = []
    for (const status of [200, 400, 410, 429, 500]) {
      const f = fakeFetch((url) => (url === TOKEN_URI ? ACCESS : { status, body: CUERPO }))
      resultados.push(await sendNative(ios(), 'customer', note, 'OrderCreated', await deps(cfg, f)))
      resultados.push(
        await sendNative(android, 'customer', note, 'OrderCreated', await deps(cfg, f)),
      )
    }
    const todo = JSON.stringify(resultados) + logs.join('\n')
    for (const prohibido of [
      SECRET_TOKEN_IOS,
      SECRET_TOKEN_ANDROID,
      'ya29.TOKEN-DE-ACCESO',
      'CUERPO-SECRETO',
      'PRIVATE KEY',
      env.APNS_KEY_P8 ?? '',
    ]) {
      expect(todo).not.toContain(prohibido)
    }
    for (const c of consola) c.mockRestore()
    // `reason` es siempre un código corto, nunca texto libre.
    for (const r of resultados as Array<{ reason: string | null }>) {
      if (r.reason !== null) expect(r.reason).toMatch(/^[A-Za-z0-9_]{1,64}$/)
    }
  })
})

// ── Guardarraíl sobre index.ts (no se puede ejecutar en vitest: imports jsr/npm) ──

describe('send-push index.ts · cada aviso lleva su app', () => {
  const src = readFileSync(
    new URL('../../../../supabase/functions/send-push/index.ts', import.meta.url),
    'utf8',
  )

  it('cada sitio que crea una nota con `userId` declara también `app`', () => {
    const userIds = src.match(/^\s+userId[:,]/gm) ?? []
    const apps = src.match(/^\s+app[:,]/gm) ?? []
    expect(userIds.length).toBeGreaterThan(10)
    expect(apps.length).toBe(userIds.length)
  })

  it('las alertas de OpsAlert van a `admin`', () => {
    const ops = src.slice(src.indexOf("if (eventType === 'OpsAlert')"))
    const bloque = ops.slice(0, ops.indexOf("if (eventType === 'OrderStatusChanged'"))
    expect(bloque).toContain("app: 'admin'")
  })

  it('el envío nativo va después del bucle de Web Push y se suma a sent/failed', () => {
    const iWeb = src.indexOf('webpush.sendNotification(')
    const iNative = src.indexOf('await deliverNative(note, event_type)')
    expect(iWeb).toBeGreaterThan(0)
    expect(iNative).toBeGreaterThan(iWeb)
    expect(src).toContain('sent += native.sent')
    expect(src).toContain('failed += native.failed')
  })
})
