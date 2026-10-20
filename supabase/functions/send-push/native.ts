// Envío de avisos a las apps nativas (FCM HTTP v1 para Android, APNs para iOS), MV7b.
//
// Módulo PURO, sin globales de Deno, para probarlo desde vitest
// (apps/api/lib/__tests__/send-push-native.test.ts): `fetch`, el reloj y la configuración
// llegan por parámetro, y solo usa WebCrypto (`crypto.subtle`), que existe en Deno y en Node.
//
// Qué NUNCA sale de aquí hacia un log o hacia la base: un secreto, un token de dispositivo,
// un token de acceso o el cuerpo de una respuesta. De la respuesta de Apple o de Google solo
// se conserva un CÓDIGO de razón (`BadDeviceToken`, `UNREGISTERED`…) que pasa por `safeCode`.
//
// Los reintentos son otro lote (MV7c): aquí un fallo se devuelve y quien llama lo registra.

export type NativeApp = 'customer' | 'negocios' | 'motorizados' | 'admin'
export type NativePlatform = 'ios' | 'android'
export type NativeEnvironment = 'production' | 'sandbox'
export type NativeOutcome = 'ok' | 'invalid_token' | 'failed'

/** Lo que el aviso necesita de una `Note` de send-push. */
export type NativeNote = { title: string; body: string; tag: string; url: string }

/** Payload v1 (`packages/contracts/src/native-push.ts`). */
export type NativePayload = {
  v: 1
  type: string
  tag: string
  title: string
  body: string
  deepLink: string
}

/** Lo mínimo que se usa de `Response`; `fetch` real y los dobles de los tests lo cumplen. */
export type NativeFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>

export type NativeDevice = {
  token: string
  platform: NativePlatform
  environment: NativeEnvironment
}

export const NATIVE_TIMEOUT_MS = 10_000
/** Apple pide renovar el token de proveedor entre 20 y 60 minutos. */
export const APNS_JWT_TTL_MS = 50 * 60_000
/** El token de acceso de Google se renueva 5 minutos antes de vencer. */
export const FCM_TOKEN_MARGIN_MS = 5 * 60_000
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
export const FCM_CHANNEL_ID = 'order_updates'

const APPS_WITH_NATIVE: readonly NativeApp[] = ['customer', 'negocios', 'motorizados']

// ── Payload y mensajes ──────────────────────────────────────────────────────

export function nativePayload(note: NativeNote, eventType: string): NativePayload {
  return {
    v: 1,
    type: eventType,
    tag: note.tag,
    title: note.title,
    body: note.body,
    deepLink: note.url,
  }
}

export type FcmMessage = {
  message: {
    token: string
    notification: { title: string; body: string }
    data: Record<string, string>
    android: {
      priority: 'HIGH'
      collapse_key: string
      notification: { tag: string; channel_id: string }
    }
  }
}

export function buildFcmMessage(token: string, payload: NativePayload): FcmMessage {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: {
        v: String(payload.v),
        type: payload.type,
        tag: payload.tag,
        title: payload.title,
        body: payload.body,
        deepLink: payload.deepLink,
      },
      android: {
        priority: 'HIGH',
        collapse_key: payload.tag,
        notification: { tag: payload.tag, channel_id: FCM_CHANNEL_ID },
      },
    },
  }
}

export type ApnsRequest = { url: string; headers: Record<string, string>; body: string }

/** `apns-collapse-id` admite hasta 64 bytes; un tag más largo se recorta (sigue siendo único en la práctica). */
function collapseId(tag: string): string {
  const enc = new TextEncoder()
  let out = tag
  while (enc.encode(out).length > 64) out = out.slice(0, -1)
  return out
}

/** La cabecera `authorization` (JWT) se añade al enviar: el constructor no toca secretos. */
export function buildApnsRequest(
  device: { token: string; environment: NativeEnvironment },
  payload: NativePayload,
  topic: string,
): ApnsRequest {
  const host = device.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  return {
    url: `https://${host}/3/device/${encodeURIComponent(device.token)}`,
    headers: {
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': collapseId(payload.tag),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        'thread-id': payload.tag,
      },
      v: payload.v,
      type: payload.type,
      tag: payload.tag,
      deepLink: payload.deepLink,
    }),
  }
}

// ── Clasificación de respuestas ─────────────────────────────────────────────

/** Solo un código corto de razón (`BadDeviceToken`) llega a los logs y a `error_message`. */
export function safeCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : null
}

export function classifyApns(status: number, reason: string | null | undefined): NativeOutcome {
  if (status === 200) return 'ok'
  if (status === 410) return 'invalid_token'
  if (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')) {
    return 'invalid_token'
  }
  return 'failed'
}

export function classifyFcm(status: number, errorStatus: string | null | undefined): NativeOutcome {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404 && errorStatus === 'UNREGISTERED') return 'invalid_token'
  if (status === 400 && errorStatus === 'INVALID_ARGUMENT') return 'invalid_token'
  return 'failed'
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** De la respuesta de APNs solo el campo `reason`. */
function apnsReasonOf(text: string): string | null {
  return safeCode(asRecord(parseJson(text))?.reason)
}

/**
 * De la respuesta de FCM solo un código. Prefiere `FcmError.errorCode` (donde Google pone
 * `UNREGISTERED` aunque el estado HTTP diga `NOT_FOUND`) y, si no, `error.status`.
 * Un 400 `INVALID_ARGUMENT` solo cuenta como token inválido si el error habla del token; si
 * habla de otra cosa se devuelve `INVALID_ARGUMENT_OTHER` y el dispositivo NO se desactiva.
 */
function fcmErrorStatusOf(text: string): string | null {
  const err = asRecord(asRecord(parseJson(text))?.error)
  if (!err) return null
  const details = Array.isArray(err.details) ? err.details : []
  let code: string | null = null
  let aboutToken = /registration token|\btoken\b/i.test(String(err.message ?? ''))
  for (const d of details) {
    const rec = asRecord(d)
    if (!rec) continue
    const fromFcm = safeCode(rec.errorCode)
    if (fromFcm) code = fromFcm
    const violations = Array.isArray(rec.fieldViolations) ? rec.fieldViolations : []
    for (const v of violations) {
      if (/token/i.test(String(asRecord(v)?.field ?? ''))) aboutToken = true
    }
  }
  const status = code ?? safeCode(err.status)
  if (status === 'INVALID_ARGUMENT' && !aboutToken) return 'INVALID_ARGUMENT_OTHER'
  return status
}

// ── WebCrypto: claves y JWT ─────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)))
}

/** PEM PKCS#8 → DER. Acepta saltos de línea reales o el texto literal `\n` (un secreto de una línea). */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, '')
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error('pem_invalid')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function signJwt(
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | EcdsaParams,
  header: Record<string, string>,
  claims: Record<string, unknown>,
): Promise<string> {
  const input = `${b64urlJson(header)}.${b64urlJson(claims)}`
  const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(input))
  return `${input}.${b64url(new Uint8Array(signature))}`
}

const ES256 = { name: 'ECDSA', hash: 'SHA-256' } as const
const RS256 = { name: 'RSASSA-PKCS1-v1_5' } as const

// ── Configuración ───────────────────────────────────────────────────────────

export type ApnsConfig = {
  signingKey: CryptoKey
  keyId: string
  teamId: string
  /** app → bundle id (`apns-topic`). Una app sin entrada no recibe por APNs. */
  topics: Readonly<Partial<Record<NativeApp, string>>>
}

export type FcmConfig = {
  signingKey: CryptoKey
  clientEmail: string
  tokenUri: string
  projectId: string
}

export type NativeConfig = { fcm: FcmConfig | null; apns: ApnsConfig | null }

async function loadFcm(raw: string | undefined): Promise<FcmConfig | null> {
  if (!raw) return null
  const json = asRecord(parseJson(raw))
  if (!json) return null
  const { client_email, private_key, project_id } = json
  const tokenUri = json.token_uri ?? 'https://oauth2.googleapis.com/token'
  if (
    typeof client_email !== 'string' ||
    !client_email.includes('@') ||
    typeof private_key !== 'string' ||
    typeof project_id !== 'string' ||
    !/^[a-z0-9][a-z0-9:.-]{2,62}$/.test(project_id) ||
    typeof tokenUri !== 'string' ||
    !tokenUri.startsWith('https://')
  ) {
    return null
  }
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return { signingKey, clientEmail: client_email, tokenUri, projectId: project_id }
}

async function loadApns(
  keyP8: string | undefined,
  keyId: string | undefined,
  teamId: string | undefined,
  topicsJson: string | undefined,
): Promise<ApnsConfig | null> {
  if (!keyP8 || !keyId || !teamId || !topicsJson) return null
  if (!/^[A-Za-z0-9]{10}$/.test(keyId) || !/^[A-Za-z0-9]{10}$/.test(teamId)) return null
  const rawTopics = asRecord(parseJson(topicsJson))
  if (!rawTopics) return null
  const topics: Partial<Record<NativeApp, string>> = {}
  for (const [app, bundle] of Object.entries(rawTopics)) {
    if (!APPS_WITH_NATIVE.includes(app as NativeApp)) return null
    if (typeof bundle !== 'string' || !/^[A-Za-z0-9.-]{3,155}$/.test(bundle)) return null
    topics[app as NativeApp] = bundle
  }
  if (Object.keys(topics).length === 0) return null
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  return { signingKey, keyId, teamId, topics }
}

/**
 * Valida al arrancar los secretos de cada plataforma (TS-9, OPS-3). Si falta o es inválida la
 * de una plataforma, SOLO esa queda apagada (falla cerrada) con una línea `native_push_disabled`
 * que trae la plataforma y nada más; la otra sigue. Nunca lanza.
 */
export async function loadNativeConfig(
  env: (name: string) => string | undefined,
  log: (line: string) => void,
): Promise<NativeConfig> {
  const off = (platform: 'fcm' | 'apns'): null => {
    log(JSON.stringify({ event: 'native_push_disabled', platform }))
    return null
  }
  let fcm: FcmConfig | null = null
  try {
    fcm = await loadFcm(env('FCM_SERVICE_ACCOUNT_JSON'))
  } catch {
    fcm = null
  }
  if (!fcm) off('fcm')
  let apns: ApnsConfig | null = null
  try {
    apns = await loadApns(
      env('APNS_KEY_P8'),
      env('APNS_KEY_ID'),
      env('APNS_TEAM_ID'),
      env('APNS_TOPICS_JSON'),
    )
  } catch {
    apns = null
  }
  if (!apns) off('apns')
  return { fcm, apns }
}

// ── Tokens de proveedor (con caché) ─────────────────────────────────────────

const apnsJwtCache = new WeakMap<ApnsConfig, { token: string; expiresAt: number }>()
const fcmTokenCache = new WeakMap<FcmConfig, { token: string; expiresAt: number }>()

/** JWT ES256 del proveedor de APNs; se reutiliza hasta 50 minutos. `now` en milisegundos. */
export async function apnsJwt(config: ApnsConfig, now: number): Promise<string> {
  const cached = apnsJwtCache.get(config)
  if (cached && now < cached.expiresAt) return cached.token
  const token = await signJwt(
    config.signingKey,
    ES256,
    { alg: 'ES256', kid: config.keyId },
    { iss: config.teamId, iat: Math.floor(now / 1000) },
  )
  apnsJwtCache.set(config, { token, expiresAt: now + APNS_JWT_TTL_MS })
  return token
}

/** Fallo al conseguir el token de acceso de Google; `code` es lo único que se registra. */
export class NativeAuthError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/**
 * Token de acceso OAuth2 de la cuenta de servicio (aserción JWT RS256 contra su `token_uri`).
 * Se reutiliza hasta 5 minutos antes de vencer.
 */
export async function fcmAccessToken(
  config: FcmConfig,
  now: number,
  fetchFn: NativeFetch,
): Promise<string> {
  const cached = fcmTokenCache.get(config)
  if (cached && now < cached.expiresAt) return cached.token
  const iat = Math.floor(now / 1000)
  const assertion = await signJwt(
    config.signingKey,
    RS256,
    { alg: 'RS256', typ: 'JWT' },
    { iss: config.clientEmail, scope: FCM_SCOPE, aud: config.tokenUri, iat, exp: iat + 3600 },
  )
  let res: { status: number; text(): Promise<string> }
  try {
    res = await fetchFn(config.tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
      signal: AbortSignal.timeout(NATIVE_TIMEOUT_MS),
    })
  } catch (e) {
    throw new NativeAuthError(isTimeout(e) ? 'timeout' : 'auth_network_error')
  }
  if (res.status !== 200) throw new NativeAuthError(`auth_http_${res.status}`)
  let body: Record<string, unknown> | null
  try {
    body = asRecord(parseJson(await res.text()))
  } catch {
    body = null
  }
  const token = body?.access_token
  const expiresIn = Number(body?.expires_in)
  if (typeof token !== 'string' || token.length === 0 || !Number.isFinite(expiresIn)) {
    throw new NativeAuthError('auth_invalid_response')
  }
  fcmTokenCache.set(config, { token, expiresAt: now + expiresIn * 1000 - FCM_TOKEN_MARGIN_MS })
  return token
}

// ── Envío ───────────────────────────────────────────────────────────────────

export type NativeSendResult = {
  channel: 'apns' | 'fcm'
  outcome: NativeOutcome
  /** Estado HTTP, o `null` si no hubo respuesta (timeout, red). */
  status: number | null
  /** Solo un código (`BadDeviceToken`, `UNREGISTERED`, `timeout`…); `null` si salió bien. */
  reason: string | null
}

export type NativeSendDeps = {
  config: NativeConfig
  fetch: NativeFetch
  /** Reloj en milisegundos. */
  now: () => number
}

async function readText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

async function sendApns(
  config: ApnsConfig,
  device: NativeDevice,
  app: NativeApp,
  payload: NativePayload,
  deps: NativeSendDeps,
): Promise<NativeSendResult | null> {
  const topic = config.topics[app]
  if (!topic) return null
  const fail = (status: number | null, reason: string): NativeSendResult => ({
    channel: 'apns',
    outcome: 'failed',
    status,
    reason,
  })
  let jwt: string
  try {
    jwt = await apnsJwt(config, deps.now())
  } catch {
    return fail(null, 'jwt_error')
  }
  const req = buildApnsRequest(device, payload, topic)
  let res: { status: number; text(): Promise<string> }
  try {
    res = await deps.fetch(req.url, {
      method: 'POST',
      headers: { ...req.headers, authorization: `bearer ${jwt}` },
      body: req.body,
      signal: AbortSignal.timeout(NATIVE_TIMEOUT_MS),
    })
  } catch (e) {
    return fail(null, isTimeout(e) ? 'timeout' : 'network_error')
  }
  const reason = res.status === 200 ? null : apnsReasonOf(await readText(res))
  const outcome = classifyApns(res.status, reason)
  // Un token de proveedor rechazado se descarta para que el siguiente envío firme uno nuevo.
  if (res.status === 403 && (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken')) {
    apnsJwtCache.delete(config)
  }
  return {
    channel: 'apns',
    outcome,
    status: res.status,
    reason: outcome === 'ok' ? null : (reason ?? `http_${res.status}`),
  }
}

async function sendFcm(
  config: FcmConfig,
  device: NativeDevice,
  payload: NativePayload,
  deps: NativeSendDeps,
): Promise<NativeSendResult> {
  const fail = (status: number | null, reason: string): NativeSendResult => ({
    channel: 'fcm',
    outcome: 'failed',
    status,
    reason,
  })
  let access: string
  try {
    access = await fcmAccessToken(config, deps.now(), deps.fetch)
  } catch (e) {
    return fail(null, e instanceof NativeAuthError ? e.code : 'auth_error')
  }
  let res: { status: number; text(): Promise<string> }
  try {
    res = await deps.fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify(buildFcmMessage(device.token, payload)),
      signal: AbortSignal.timeout(NATIVE_TIMEOUT_MS),
    })
  } catch (e) {
    return fail(null, isTimeout(e) ? 'timeout' : 'network_error')
  }
  const ok = res.status >= 200 && res.status < 300
  const errorStatus = ok ? null : fcmErrorStatusOf(await readText(res))
  const outcome = classifyFcm(res.status, errorStatus)
  if (res.status === 401) fcmTokenCache.delete(config)
  return {
    channel: 'fcm',
    outcome,
    status: res.status,
    reason: outcome === 'ok' ? null : (errorStatus ?? `http_${res.status}`),
  }
}

/** Tope de dispositivos por aviso: los vistos más recientemente (la consulta los ordena). */
export const MAX_NATIVE_DEVICES_PER_NOTE = 5

/**
 * Manda un aviso a los dispositivos recibidos, como máximo `MAX_NATIVE_DEVICES_PER_NOTE` (los
 * primeros: quien llama los trae ya ordenados por `last_seen_at` descendente; el recorte es
 * defensivo), EN PARALELO, para que un proveedor caído no retrase los avisos de los demás.
 * Por cada envío que no sea `null` llama a `record` (el registro en la base). Un fallo de
 * `record` en un dispositivo no frena a los demás ni se propaga: solo se cuenta en
 * `recordFailed`, sin datos del dispositivo. Nunca lanza.
 */
export async function deliverToDevices<D extends NativeDevice>(
  devices: readonly D[],
  app: NativeApp,
  note: NativeNote,
  eventType: string,
  deps: NativeSendDeps,
  record: (device: D, result: NativeSendResult) => Promise<void>,
): Promise<{ sent: number; failed: number; recordFailed: number }> {
  const tally = { sent: 0, failed: 0, recordFailed: 0 }
  await Promise.all(
    devices.slice(0, MAX_NATIVE_DEVICES_PER_NOTE).map(async (device) => {
      const result = await sendNative(device, app, note, eventType, deps)
      if (!result) return
      if (result.outcome === 'ok') tally.sent++
      else tally.failed++
      try {
        await record(device, result)
      } catch {
        tally.recordFailed++
      }
    }),
  )
  return tally
}

/**
 * Qué dispositivos leer para un aviso: los del destinatario, de la app del aviso y de una
 * plataforma configurada (además, activos y con avisos permitidos, que lo añade la consulta).
 * `null` si no hay nada que leer: `admin` solo va por Web Push, o ninguna plataforma está
 * configurada. Un usuario con varios roles solo recibe en la app que corresponde al aviso.
 */
export function nativeDeviceFilter(
  note: { userId: string; app: NativeApp },
  config: NativeConfig,
): { userId: string; app: Exclude<NativeApp, 'admin'>; platforms: NativePlatform[] } | null {
  if (note.app === 'admin') return null
  const platforms: NativePlatform[] = []
  if (config.apns) platforms.push('ios')
  if (config.fcm) platforms.push('android')
  if (platforms.length === 0) return null
  return { userId: note.userId, app: note.app, platforms }
}

/**
 * Manda un aviso a UN dispositivo. Devuelve `null` si no corresponde enviar: la app es
 * `admin` (solo Web Push), la plataforma no está configurada o la app no tiene bundle id en
 * APNs. Nunca lanza: todo fallo vuelve como resultado `failed`.
 */
export async function sendNative(
  device: NativeDevice,
  app: NativeApp,
  note: NativeNote,
  eventType: string,
  deps: NativeSendDeps,
): Promise<NativeSendResult | null> {
  if (app === 'admin') return null
  const payload = nativePayload(note, eventType)
  try {
    if (device.platform === 'ios') {
      return deps.config.apns ? await sendApns(deps.config.apns, device, app, payload, deps) : null
    }
    return deps.config.fcm ? await sendFcm(deps.config.fcm, device, payload, deps) : null
  } catch {
    return {
      channel: device.platform === 'ios' ? 'apns' : 'fcm',
      outcome: 'failed',
      status: null,
      reason: 'unexpected_error',
    }
  }
}
