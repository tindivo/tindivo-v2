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
  /**
   * `www` ES OTRO ORIGEN, y es el que usan los clientes de verdad.
   *
   * Para CORS, `https://tindivo.com` y `https://www.tindivo.com` no se parecen
   * en nada: la comparación es de cadena exacta, sin idea de "mismo sitio". La
   * lista solo tenía el ápex mientras la web se sirve en `www`, así que toda
   * petición del cliente caía al comodín y el navegador la bloqueaba.
   *
   * Tumbó el registro del piloto en producción el 2026-08-12, en
   * `/public/businesses` y `/public/pilot-access` — las dos primeras llamadas
   * que hace un vecino al entrar. No se cayó "la API": se cayó la puerta.
   *
   * Se quedan los dos: cuál sirve el DNS es una decisión que puede cambiar, y
   * un redirect de uno a otro no salva el preflight (el OPTIONS se manda al
   * origen que pidió el navegador, no al destino del redirect).
   */
  'https://www.tindivo.com',
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
  if (!origin) return true
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
  const allowed = isAllowed(origin)
  const targetOrigin = origin && allowed ? origin : '*'

  const headers: Record<string, string> = {
    'access-control-allow-origin': targetOrigin,
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,idempotency-key,x-request-id,accept,x-requested-with',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }

  // W3C CORS Spec: credentials NO se pueden enviar junto a '*'
  if (targetOrigin !== '*') {
    headers['access-control-allow-credentials'] = 'true'
  }

  return headers
}

/** Maneja el preflight OPTIONS. */
export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}
