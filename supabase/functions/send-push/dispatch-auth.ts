// Autenticación del emisor de los eventos normales de send-push, sin imports de Deno
// para poder probarla desde vitest (apps/api/lib/__tests__/send-push-dispatch-auth.test.ts).
//
// Quién llama a send-push: el trigger `dispatch_event` de la base (pg_net) y, para la
// rama `OpsAlert`, la API. La clave anónima viaja en los bundles web, así que NO prueba
// nada. El trigger manda además un secreto propio (Supabase Vault) en esta cabecera.

/** Cabecera con el secreto de despacho (`PUSH_DISPATCH_SECRET`). */
export const DISPATCH_SECRET_HEADER = 'x-push-dispatch-secret'

/**
 * Eventos que NO usan el secreto de despacho porque tienen el suyo (`x-ops-alert-secret`,
 * rama `OpsAlert`). Lista cerrada y explícita: todo lo demás exige el secreto de despacho.
 */
export const DISPATCH_EXEMPT_EVENTS: readonly string[] = ['OpsAlert']

/** ¿Este `event_type` debe presentar el secreto de despacho? (todo salvo la lista de arriba). */
export function needsDispatchSecret(eventType: unknown): boolean {
  return !(typeof eventType === 'string' && DISPATCH_EXEMPT_EVENTS.includes(eventType))
}

/**
 * ¿La petición viene del trigger de la base? Compara en tiempo constante (sin salir en el
 * primer byte distinto) la cabecera con el secreto de la función. Sin secreto configurado
 * rechaza TODO: falla cerrado.
 */
export function isDispatchCaller(headerValue: string | null, secret: string | undefined): boolean {
  if (!secret || headerValue === null) return false
  const enc = new TextEncoder()
  const a = enc.encode(headerValue)
  const b = enc.encode(secret)
  // Se recorre siempre el largo del secreto; la diferencia de tamaño también cuenta.
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
