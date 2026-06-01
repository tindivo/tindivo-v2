/**
 * CORS para los subdominios de Tindivo + localhost en dev. La API es consumida
 * por las 4 PWAs desde orígenes distintos.
 *
 * Orígenes permitidos = los dominios de producción + los de `ALLOWED_ORIGINS`
 * (env, coma-separado) para entornos como Vercel preview/semi-prod
 * (p.ej. `https://tindivo-v2-customer.vercel.app,https://tindivo-v2-negocios.vercel.app`).
 */
const DEFAULT_ORIGINS = [
  'https://tindivo.com',
  'https://negocios.tindivo.com',
  'https://motorizados.tindivo.com',
  'https://admin.tindivo.com',
]
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = [...DEFAULT_ORIGINS, ...EXTRA_ORIGINS]

function isAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // dev: cualquier localhost / 127.0.0.1
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  // semi-prod opcional: cualquier preview de este proyecto en Vercel
  if (
    process.env.ALLOW_VERCEL_PREVIEWS === '1' &&
    /^https:\/\/tindivo-v2-[a-z0-9-]+\.vercel\.app$/.test(origin)
  )
    return true
  return false
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
