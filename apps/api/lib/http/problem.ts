import {
  type ApiErrorCode,
  ERROR_CODE_STATUS,
  type ProblemDetails,
  type ValidationIssue,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { ZodError } from 'zod'
import { corsHeaders } from './cors'

interface ProblemOptions {
  detail?: string
  title?: string
  errors?: ValidationIssue[]
  requestId?: string
  headers?: HeadersInit
}

/** Respuesta de error canónica (RFC 9457 Problem Details). */
export function problem(code: ApiErrorCode, opts: ProblemOptions = {}): Response {
  const status = ERROR_CODE_STATUS[code]
  const body: ProblemDetails = {
    type: 'about:blank',
    title: opts.title ?? code,
    status,
    code,
    detail: opts.detail,
    requestId: opts.requestId,
    errors: opts.errors,
  }
  return Response.json(body, {
    status,
    headers: { 'content-type': 'application/problem+json', ...opts.headers },
  })
}

/** Respuesta de éxito con envoltura `{ data }` o `{ items, ... }`. */
export function ok<T>(data: T, opts: { status?: number; headers?: HeadersInit } = {}): Response {
  return Response.json({ data }, { status: opts.status ?? 200, headers: opts.headers })
}

/** Respuesta de éxito directa (sin envoltura) — p.ej. tracking público. */
export function raw<T>(data: T, opts: { status?: number; headers?: HeadersInit } = {}): Response {
  return Response.json(data, { status: opts.status ?? 200, headers: opts.headers })
}

/** Mapea cualquier error a un Problem Details. ZodError → 422; DomainError → su code. */
export function handleError(err: unknown, requestId?: string, req?: Request): Response {
  // Las respuestas de error TAMBIÉN necesitan headers CORS: si no, el browser
  // bloquea su lectura cross-origin y el front ve "Failed to fetch" en vez del mensaje.
  const headers = req ? corsHeaders(req) : undefined
  if (err instanceof ZodError) {
    return problem('validation_error', {
      detail: 'La validación de la solicitud falló',
      errors: err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
      requestId,
      headers,
    })
  }
  if (err instanceof DomainError) {
    return problem(err.code, { detail: err.message, requestId, headers })
  }
  console.error('[api] error no manejado:', err)
  return problem('internal_error', { detail: 'Ocurrió un error interno', requestId, headers })
}
