import {
  type ClientCompatSettings,
  ClientCompatSettingsSchema,
  evaluateClientVersion,
  parseClientContext,
} from '@tindivo/contracts'
import { createServiceClient } from '../supabase/service'
import { corsHeaders } from './cors'
import { problem } from './problem'

/**
 * Compatibilidad app-API. Los mínimos salen de `app_settings.client_compat`
 * (nunca del código) y se guardan 30 s en memoria: la comprobación corre en
 * cada petición de una app nativa y no debe costar una consulta cada vez.
 */

const TTL_MS = 30_000
let cache: { at: number; value: ClientCompatSettings | null } | null = null

/** Para los tests: olvida lo guardado y fuerza releer la base. */
export function resetClientCompatCache(): void {
  cache = null
}

/** `null` si la clave no existe o no es válida: quien llama decide (aquí, no bloquear). */
export async function loadClientCompat(now = Date.now()): Promise<ClientCompatSettings | null> {
  if (cache && now - cache.at < TTL_MS) return cache.value
  let value: ClientCompatSettings | null = null
  try {
    const { data } = await createServiceClient()
      .from('app_settings')
      .select('value')
      .eq('key', 'client_compat')
      .maybeSingle()
    const parsed = ClientCompatSettingsSchema.safeParse(data?.value)
    value = parsed.success ? parsed.data : null
  } catch {
    value = null
  }
  cache = { at: now, value }
  return value
}

/**
 * Respuesta 426 si la app es demasiado vieja; `null` si puede pasar. Falla
 * abierto: sin cabeceras, sin configuración o con la base caída, no bloquea.
 */
export async function rejectOutdatedClient(req: Request): Promise<Response | null> {
  const ctx = parseClientContext(req.headers)
  if (!ctx?.version) return null // las PWAs de hoy no mandan nada: ni se consulta la base
  const settings = await loadClientCompat()
  if (!settings) return null
  const verdict = evaluateClientVersion(ctx, settings)
  if (verdict.ok) return null
  return problem('client_upgrade_required', {
    title: 'Actualiza la app',
    detail: `Esta versión de la app ya no es compatible. Actualiza a la ${verdict.minVersion} o posterior.`,
    headers: {
      ...corsHeaders(req),
      'x-tindivo-min-version': verdict.minVersion,
    },
  })
}
