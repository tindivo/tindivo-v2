import { CLIENT_APPS, CLIENT_HEADERS, CLIENT_PLATFORMS } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { ZodError, type ZodType, z } from 'zod'
import { type Deps, getDeps } from '../composition'
import type { Actor } from '../modules/identity'
import { corsHeaders } from './cors'
import { handleError, problem } from './problem'

/**
 * Pasos de TS-17 que este handler NO repite porque ya los hace `apps/api/proxy.ts` para todo
 * `/api/*`: el 426 por versión mínima del cliente (paso 2) y el límite de uso por IP (parte del
 * paso 6). Cuando el servicio salga de Next.js, esos pasos se mueven aquí.
 */

export type Handler = (request: Request, params: Record<string, string>) => Promise<Response>

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Política de límite de uso (API-10). Todavía no se implementa: ver `defineHandler`. */
export interface RateLimitPolicy {
  limit: number
  windowSeconds: number
}

export interface HandlerSpec<P, Q, B, R> {
  /** Módulo dueño del handler; sale en cada línea de log. */
  module: string
  method: HttpMethod
  path: `/api/v1/${string}`
  auth: 'none' | 'user' | 'admin'
  params?: ZodType<P>
  query?: ZodType<Q>
  body?: ZodType<B>
  response: ZodType<R> | 'empty'
  /** Exigiría `Idempotency-Key` (API-6). Aún no implementado: pedirlo lanza al definir. */
  idempotent?: boolean
  /** Límite de uso (API-10). Aún no implementado: pedirlo lanza al definir. */
  rateLimit?: RateLimitPolicy
  /** Tope del cuerpo en bytes (API-9). Por defecto 64 KiB. */
  maxBodyBytes?: number
}

export interface HandlerInput<P, Q, B> {
  /** `null` solo si `auth` es `none`. */
  actor: Actor | null
  params: P
  query: Q
  body: B
  deps: Deps
  requestId: string
}

export type DefinedHandler<P, Q, B, R> = Handler & {
  spec: HandlerSpec<P, Q, B, R>
  /** Mismo handler con dependencias inyectadas, sin tocar el singleton (para pruebas). */
  withDeps(deps: Deps): Handler
}

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024

const REQUEST_ID = z.uuid()
const APP_VERSION = /^[0-9]{1,4}([.][0-9]{1,4}){0,3}$/
const BUILD = /^[0-9]{1,10}$/

/** Valor de la cabecera solo si está en la lista del contrato; si no, `null`. */
function oneOf(value: string | null, allowed: readonly string[]): string | null {
  return value !== null && allowed.includes(value) ? value : null
}

function matching(value: string | null, pattern: RegExp): string | null {
  return value !== null && pattern.test(value) ? value : null
}

/**
 * Cabeceras de cliente (CLI-3) para el log. Las escribe el cliente: cada una se valida contra
 * el contrato y, si no cumple, se registra `null`; el texto recibido nunca llega al log.
 */
function clientFields(request: Request) {
  const get = (name: string) => request.headers.get(name)?.trim() ?? null
  return {
    clientPlatform: oneOf(get(CLIENT_HEADERS.platform)?.toLowerCase() ?? null, CLIENT_PLATFORMS),
    clientApp: oneOf(get(CLIENT_HEADERS.app)?.toLowerCase() ?? null, CLIENT_APPS),
    clientAppVersion: matching(get(CLIENT_HEADERS.appVersion), APP_VERSION),
    clientBuild: matching(get(CLIENT_HEADERS.build), BUILD),
  }
}

/** El cuerpo supera el límite: sin código propio en el contrato, es un 422 `validation_error`. */
class BodyTooLargeError extends DomainError {
  constructor(maxBytes: number) {
    super(`El cuerpo de la solicitud supera el límite de ${maxBytes} bytes`, 'validation_error')
  }
}

class InvalidJsonError extends DomainError {
  constructor() {
    super('El cuerpo de la solicitud debe ser JSON válido', 'validation_error')
  }
}

/** Lee el cuerpo y corta en cuanto pasa del límite, sin leerlo entero. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  const stream = request.body
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function assertWithinContentLength(request: Request, maxBytes: number): void {
  const declared = request.headers.get('content-length')
  if (declared === null) return
  const length = Number(declared)
  if (Number.isFinite(length) && length > maxBytes) throw new BodyTooLargeError(maxBytes)
}

/**
 * Valida con el esquema. Sin esquema, el valor pasa tal cual: el tipo por defecto de cada
 * genérico lo describe así (TS-2: único cast de este archivo, confinado aquí).
 */
function parseWith<T>(schema: ZodType<T> | undefined, value: unknown): T {
  if (!schema) return value as T
  return schema.parse(value)
}

function queryToRecord(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of url.searchParams) out[key] = value
  return out
}

/**
 * Crea un handler con el contrato de TS-17. Pasos, en orden: request-id, límite de cuerpo,
 * autenticación, lectura acotada del cuerpo, validación (params, query, body), `run`, respuesta, errores y log.
 */
export function defineHandler<
  P = Record<string, string>,
  Q = Record<string, string>,
  B = undefined,
  R = unknown,
>(
  spec: HandlerSpec<P, Q, B, R>,
  run: (input: HandlerInput<P, Q, B>) => Promise<R | undefined>,
): DefinedHandler<P, Q, B, R> {
  if (spec.idempotent) {
    throw new Error(
      `defineHandler(${spec.method} ${spec.path}): 'idempotent' aún no está implementado (API-6); no lo declares hasta que lo esté`,
    )
  }
  if (spec.rateLimit) {
    throw new Error(
      `defineHandler(${spec.method} ${spec.path}): 'rateLimit' aún no está implementado (API-10); no lo declares hasta que lo esté`,
    )
  }
  const maxBodyBytes = spec.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  function build(resolveDeps: () => Deps): Handler {
    return async (request, rawParams) => {
      const deps = resolveDeps()
      const startedAt = performance.now()
      const incomingId = request.headers.get('x-request-id')
      // Lo manda el cliente y va al log y a la respuesta: solo se acepta si es un UUID.
      const parsedId = REQUEST_ID.safeParse(incomingId)
      const requestId = parsedId.success ? parsedId.data : deps.ids.uuid()
      const logger = deps.logger.child(spec.module)

      const finalize = (response: Response): Response => {
        response.headers.set('x-request-id', requestId)
        if (spec.auth !== 'none') response.headers.set('cache-control', 'private, no-store')
        logger.info('request', {
          requestId,
          method: spec.method,
          path: spec.path,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          ...clientFields(request),
        })
        return response
      }

      try {
        assertWithinContentLength(request, maxBodyBytes)

        const actor = spec.auth === 'none' ? null : await deps.auth.authenticate(request, spec.auth)

        // Con o sin esquema, un cuerpo se lee SIEMPRE con el contador: un stream sin
        // content-length (o con uno falso) no puede pasar del límite. Sin esquema se descarta.
        const bodyText = request.body === null ? null : await readLimitedText(request, maxBodyBytes)

        const params = parseWith(spec.params, rawParams)
        const query = parseWith(spec.query, queryToRecord(new URL(request.url)))
        let body: B
        if (spec.body) {
          let json: unknown
          try {
            json = JSON.parse(bodyText ?? '')
          } catch {
            throw new InvalidJsonError()
          }
          body = spec.body.parse(json)
        } else {
          body = parseWith<B>(undefined, undefined)
        }

        const result = await run({ actor, params, query, body, deps, requestId })

        const headers = corsHeaders(request)
        if (spec.response === 'empty') {
          return finalize(new Response(null, { status: 204, headers }))
        }
        if (process.env.NODE_ENV !== 'production') {
          const check = spec.response.safeParse(result)
          if (!check.success) {
            logger.error('invalid_response', {
              requestId,
              path: spec.path,
              // Solo dónde y qué tipo de fallo: el mensaje puede citar el valor recibido.
              issues: check.error.issues.map((i) => ({
                field: i.path.join('.') || '(root)',
                code: i.code,
              })),
            })
            return finalize(
              problem('internal_error', {
                detail: 'La respuesta no cumple el contrato',
                requestId,
                headers,
              }),
            )
          }
        }
        return finalize(Response.json({ data: result }, { status: 200, headers }))
      } catch (err) {
        if (err instanceof ZodError || err instanceof DomainError) {
          return finalize(handleError(err, requestId, request))
        }
        logger.error('unhandled_error', { requestId, path: spec.path, failure: err })
        return finalize(
          problem('internal_error', {
            detail: 'Ocurrió un error interno',
            requestId,
            headers: corsHeaders(request),
          }),
        )
      }
    }
  }

  const handler: DefinedHandler<P, Q, B, R> = Object.assign(build(getDeps), {
    spec,
    withDeps: (deps: Deps) => build(() => deps),
  })
  return handler
}
