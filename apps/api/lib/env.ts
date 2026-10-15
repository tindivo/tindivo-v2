import { z } from 'zod'

/**
 * Variables de entorno del servidor (apps/api). Se validan de forma perezosa en
 * tiempo de request (no al importar) para no romper el build cuando faltan.
 */
/** Vacío o solo espacios cuenta como ausente; el resto se recorta (como `envValue`). */
const trimmed = (v: unknown) => {
  if (typeof v !== 'string') return v
  const t = v.trim()
  return t === '' ? undefined : t
}

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.preprocess(trimmed, z.url().optional()),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(trimmed, z.string().optional()),
  // Secreto del HMAC del contador de OTP por número (lib/otp/phone-limit.ts).
  // Opcional: sin él ese límite falla abierto y lo registra. Vacío ('') cuenta
  // como ausente: si no, `serverEnv()` lanzaría y tumbaría TODO el endpoint.
  OTP_PHONE_HMAC_SECRET: z.preprocess(trimmed, z.string().min(1).optional()),
  // Solo dev local: ruta al Chrome/Chromium instalado, para el reporte PDF de
  // rendimiento. En producción se usa @sparticuz/chromium (ver lib/pdf/browser.ts).
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>

let cached: ServerEnv | null = null

export function serverEnv(): ServerEnv {
  if (cached === null) {
    cached = ServerEnvSchema.parse(process.env)
  }
  return cached
}
