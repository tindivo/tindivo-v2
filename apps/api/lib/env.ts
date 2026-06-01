import { z } from 'zod'

/**
 * Variables de entorno del servidor (apps/api). Se validan de forma perezosa en
 * tiempo de request (no al importar) para no romper el build cuando faltan.
 */
const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>

let cached: ServerEnv | null = null

export function serverEnv(): ServerEnv {
  if (cached === null) {
    cached = ServerEnvSchema.parse(process.env)
  }
  return cached
}
