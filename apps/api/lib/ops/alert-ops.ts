import { createServiceClient } from '../supabase/service'

/**
 * Alerta operativa al admin (web push), con deduplicación.
 *
 * X = 30 MINUTOS por tipo. Una mala configuración es persistente: cada petición
 * a `send-code` la dispararía, y un push por petición inundaría el teléfono de
 * Jesús (y las suscripciones se purgarían por rechazo). 30 min es lo bastante
 * corto para que, si nadie reacciona, la alerta vuelva a sonar dos veces por
 * hora, y lo bastante largo para no ser ruido. Se aplica por tipo, no global.
 *
 * LÍMITE CONOCIDO: la deduplicación vive en la memoria de cada instancia
 * serverless, así que con varias instancias en caliente puede llegar más de una
 * por ventana (una por instancia). Es aceptable: es la segunda defensa y el
 * ruido máximo es acotado. No se usa Redis para esto a propósito: el caso que
 * alerta es justamente «Redis no está configurado».
 *
 * SIN DATOS PERSONALES. `detail` es texto técnico (nombres de variables); el
 * canal solo transporta `kind` (de una lista cerrada en la Edge Function).
 */
export const OPS_ALERT_DEDUPE_MS = 30 * 60 * 1000

type Send = (kind: string, detail: string) => Promise<void>

export function createAlertOps(deps: { send: Send; now?: () => number; dedupeMs?: number }) {
  const now = deps.now ?? Date.now
  const dedupeMs = deps.dedupeMs ?? OPS_ALERT_DEDUPE_MS
  const lastAt = new Map<string, number>()

  /** `true` si se mandó; `false` si se deduplicó o el envío falló. Nunca lanza. */
  return async function alertOps(kind: string, detail: string): Promise<boolean> {
    const t = now()
    const prev = lastAt.get(kind)
    if (prev !== undefined && t - prev < dedupeMs) return false
    // Se reserva ANTES de esperar al envío: llamadas simultáneas no duplican.
    lastAt.set(kind, t)
    try {
      await deps.send(kind, detail)
      return true
    } catch (err) {
      // Un envío fallido no consume la ventana: la próxima llamada reintenta.
      if (lastAt.get(kind) === t) {
        if (prev === undefined) lastAt.delete(kind)
        else lastAt.set(kind, prev)
      }
      console.error(`[alert-ops] no se pudo mandar la alerta "${kind}":`, err)
      return false
    }
  }
}

/**
 * Envío real: reutiliza el canal existente (Edge Function `send-push`, la misma
 * que dispara el outbox) con `event_type: 'OpsAlert'`. La función resuelve a los
 * usuarios con rol admin y manda el push a sus `push_subscriptions`. URL y llave
 * salen de `app_settings.push_dispatch`, como en el trigger `dispatch_event`.
 * Sin esquema nuevo.
 */
async function sendViaPushFunction(kind: string, _detail: string): Promise<void> {
  const { data, error } = await createServiceClient()
    .from('app_settings')
    .select('value')
    .eq('key', 'push_dispatch')
    .maybeSingle()
  if (error) throw new Error(error.message)
  const cfg = data?.value as { url?: string; anonKey?: string } | null
  if (!cfg?.url) throw new Error('push_dispatch no configurado')
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.anonKey ?? ''}` },
    // `_detail` NO viaja: queda en el log de la API; el push lleva texto fijo por `kind`.
    body: JSON.stringify({ event_type: 'OpsAlert', aggregate_id: kind, payload: { kind } }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`send-push respondió ${res.status}`)
}

const instance = createAlertOps({ send: sendViaPushFunction })

export async function alertOps(kind: string, detail: string): Promise<boolean> {
  console.error(`[alert-ops] ${kind}: ${detail}`)
  return instance(kind, detail)
}
