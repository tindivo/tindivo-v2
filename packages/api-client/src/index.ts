import type { ApiErrorCode, ProblemDetails } from '@tindivo/contracts'

/** Error tipado lanzado cuando la API responde con un Problem Details (RFC 9457). */
export class ApiError extends Error {
  readonly problem: ProblemDetails
  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.problem = problem
  }
  get code(): ApiErrorCode {
    return this.problem.code
  }
  get status(): number {
    return this.problem.status
  }
}

/**
 * La API no contestó dentro del plazo.
 *
 * NO hereda de `ApiError` a propósito: `ApiError` envuelve un Problem Details,
 * y aquí no hubo respuesta que interpretar. Quien discrimine por
 * `instanceof ApiError` seguirá tratando esto como lo que es —un fallo de red
 * de resultado desconocido— y no como un veredicto del servidor. Eso importa
 * en la creación del pedido, donde un 4xx regenera la clave de idempotencia y
 * un fallo de red la conserva (`use-checkout-actions.ts`).
 */
export class ApiTimeoutError extends Error {
  readonly path: string
  readonly timeoutMs: number
  constructor(path: string, timeoutMs: number) {
    super(`La API no respondió en ${Math.round(timeoutMs / 1000)}s (${path})`)
    this.name = 'ApiTimeoutError'
    this.path = path
    this.timeoutMs = timeoutMs
  }
}

/**
 * Cuánto se espera a la API antes de darla por perdida.
 *
 * `fetch` NO TRAE PLAZO PROPIO, y esa es toda la historia. Una petición que
 * sale y no vuelve —el caso corriente de una conexión de pueblo, no el raro—
 * deja su promesa colgada para siempre. Arriba eso no se ve como un error: se
 * ve como un `loading` que nunca baja, y detrás de un `loading` que nunca baja
 * suele haber un botón deshabilitado con pinta de botón vivo. Pasó en prod el
 * 2026-09-09 con «Ir a pagar» (ver `features/cart/components/cart-ctas.tsx`):
 * la clienta lo tocó, no ocurrió nada, y el pedido acabó entrando por teléfono.
 *
 * QUINCE SEGUNDOS ES LARGO A PROPÓSITO. La petición que más paciencia merece
 * es la que crea el pedido, y esa viaja con `idempotency-key`: quien llama
 * conserva la clave cuando el fallo no es un 4xx del servidor, así que
 * reintentar tras un plazo agotado no puede duplicar nada — si el servidor
 * llegó a crear el pedido, la segunda llamada recibe la MISMA respuesta que ya
 * emitió. El plazo es la red de seguridad, no el camino normal.
 */
export const DEFAULT_TIMEOUT_MS = 15_000

/**
 * El PDF se sale de la regla, y con motivo: lo dibuja un Chromium serverless
 * que puede arrancar en frío. Quince segundos lo mataría justo cuando estaba
 * por salir, y es además el único `getBlob` del repo.
 */
export const BLOB_TIMEOUT_MS = 60_000

export interface ApiClientOptions {
  /** Base de la API, p.ej. https://apiv2.tindivo.com/api/v1 */
  baseUrl: string
  /** Devuelve el access token actual (Bearer) o null si no hay sesión. */
  getAccessToken?: () => string | null | Promise<string | null>
  /** Plazo por defecto de este cliente. `0` o no finito = sin plazo. */
  timeoutMs?: number
}

export interface RequestOptions {
  method?: string
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
  /** Plazo solo para esta llamada. `0` o no finito = sin plazo. */
  timeoutMs?: number
}

/** Envoltura estándar de respuesta de éxito de la API. */
export interface ApiEnvelope<T> {
  data: T
}

/**
 * Un `AbortSignal` que se dispara por plazo agotado O porque quien llamó abortó,
 * y que sabe cuál de las dos cosas fue.
 *
 * `AbortSignal.any()` hace esto en una línea, pero pide Chrome 116 / Safari
 * 17.4 y el piloto corre en los teléfonos que hay, no en los que quisiéramos.
 * Enlazarlo a mano no cuesta nada y funciona en todos.
 */
function conPlazo(timeoutMs: number, externo?: AbortSignal) {
  const ctrl = new AbortController()
  let vencido = false

  const abortar = () => ctrl.abort()
  if (externo) {
    if (externo.aborted) ctrl.abort()
    else externo.addEventListener('abort', abortar, { once: true })
  }

  const hayPlazo = Number.isFinite(timeoutMs) && timeoutMs > 0
  const timer = hayPlazo
    ? setTimeout(() => {
        vencido = true
        ctrl.abort()
      }, timeoutMs)
    : undefined

  return {
    signal: ctrl.signal,
    /** true solo si lo cortó el plazo; un abort de quien llamó NO cuenta. */
    get vencido() {
      return vencido
    },
    soltar() {
      if (timer !== undefined) clearTimeout(timer)
      externo?.removeEventListener('abort', abortar)
    },
  }
}

export function createApiClient(opts: ApiClientOptions) {
  async function authHeaders(extra?: RequestOptions): Promise<Headers> {
    const headers = new Headers()
    headers.set('x-request-id', crypto.randomUUID())
    if (extra?.body !== undefined) headers.set('content-type', 'application/json')
    if (extra?.idempotencyKey) headers.set('idempotency-key', extra.idempotencyKey)
    const token = await opts.getAccessToken?.()
    if (token) headers.set('authorization', `Bearer ${token}`)
    return headers
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = await authHeaders(options)
    const plazo = options.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const lazo = conPlazo(plazo, options.signal)

    try {
      const res = await fetch(`${opts.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        credentials: 'include',
        signal: lazo.signal,
      })

      // El cuerpo entra DENTRO del plazo, no fuera: una respuesta que abre
      // cabeceras y luego se queda a medias cuelga igual de eterna que una que
      // no llegó nunca, y desde arriba las dos se ven idénticas.
      const text = await res.text()
      const json: unknown = text ? JSON.parse(text) : null

      if (!res.ok) {
        throw new ApiError(json as ProblemDetails)
      }
      return json as T
    } catch (err) {
      if (lazo.vencido) throw new ApiTimeoutError(path, plazo)
      throw err
    } finally {
      lazo.soltar()
    }
  }

  /** Descarga binaria (p.ej. un PDF): el éxito no es JSON, pero el error sigue siendo un Problem Details. */
  async function getBlob(path: string, signal?: AbortSignal, timeoutMs?: number): Promise<Blob> {
    const headers = await authHeaders()
    const plazo = timeoutMs ?? BLOB_TIMEOUT_MS
    const lazo = conPlazo(plazo, signal)

    try {
      const res = await fetch(`${opts.baseUrl}${path}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: lazo.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        const json: unknown = text ? JSON.parse(text) : null
        throw new ApiError(json as ProblemDetails)
      }
      return await res.blob()
    } catch (err) {
      if (lazo.vencido) throw new ApiTimeoutError(path, plazo)
      throw err
    } finally {
      lazo.soltar()
    }
  }

  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
    post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
      request<T>(path, { method: 'POST', body, idempotencyKey }),
    put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    getBlob,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
