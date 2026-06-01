/**
 * CORS para los subdominios de Tindivo + localhost en dev. La API es consumida
 * por las 4 PWAs desde orígenes distintos.
 */
const ALLOWED_ORIGINS = [
  'https://tindivo.com',
  'https://negocios.tindivo.com',
  'https://motorizados.tindivo.com',
  'https://admin.tindivo.com',
]

function isAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // dev: cualquier localhost / 127.0.0.1
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!isAllowed(origin) || origin === null) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,idempotency-key,x-request-id',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

/** Maneja el preflight OPTIONS. */
export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}
