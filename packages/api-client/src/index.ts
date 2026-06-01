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

export interface ApiClientOptions {
  /** Base de la API, p.ej. https://api.tindivo.com/api/v1 */
  baseUrl: string
  /** Devuelve el access token actual (Bearer) o null si no hay sesión. */
  getAccessToken?: () => string | null | Promise<string | null>
}

export interface RequestOptions {
  method?: string
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

/** Envoltura estándar de respuesta de éxito de la API. */
export interface ApiEnvelope<T> {
  data: T
}

export function createApiClient(opts: ApiClientOptions) {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers()
    headers.set('x-request-id', crypto.randomUUID())
    if (options.body !== undefined) headers.set('content-type', 'application/json')
    if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)
    const token = await opts.getAccessToken?.()
    if (token) headers.set('authorization', `Bearer ${token}`)

    const res = await fetch(`${opts.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'include',
      signal: options.signal,
    })

    const text = await res.text()
    const json: unknown = text ? JSON.parse(text) : null

    if (!res.ok) {
      throw new ApiError(json as ProblemDetails)
    }
    return json as T
  }

  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
    post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
      request<T>(path, { method: 'POST', body, idempotencyKey }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
