import { configureBackend } from '@tindivo/backend/composition'
import type { Handler } from '@tindivo/backend/http'
import { serverEnv } from '../lib/env'

/** Un handler de `defineHandler`: lo que el adaptador necesita de él es su método y su ruta. */
export type RouteHandler = Handler & { spec: { method: string; path: string } }

export type NextRoute = ((
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>) & { handler: RouteHandler }

let configured = false

/** Configura el backend con el entorno ya validado, una sola vez (y no al importar: no rompe el build). */
export function ensureBackendConfigured(): void {
  if (configured) return
  const env = serverEnv()
  configureBackend({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  })
  configured = true
}

/**
 * Único archivo que conoce la forma de Next.js (DES-9). Next 16 entrega `params` como promesa.
 * Adjunta `handler` a la función devuelta para el test de enlace de rutas.
 */
export function toNextRoute(handler: RouteHandler): NextRoute {
  const route = async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    ensureBackendConfigured()
    return handler(request, await context.params)
  }
  return Object.assign(route, { handler })
}
