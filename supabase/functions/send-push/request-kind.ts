// Clasificación pura de la petición que recibe send-push, sin imports de Deno para poder
// probarla desde vitest (apps/api/lib/__tests__/send-push-request-kind.test.ts).
//
// Quién llama: el trigger `dispatch_event` de la base (pg_net) y, para `OpsAlert`, la API.
// La clave anónima viaja en los bundles web, así que NO prueba nada. Por eso los eventos
// normales no se creen del cuerpo: el cuerpo trae solo el `event_id`, y la función lo
// reclama en la base (`claim_push_event`) y usa lo que la base dice.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RequestKind =
  | { kind: 'ops' }
  | { kind: 'event'; eventId: string }
  | { kind: 'invalid' }

/**
 * `OpsAlert` EXACTO va a la rama de la API (su propio secreto). Cualquier otro valor
 * (variantes de mayúsculas, no-texto, ausente) es un evento normal y exige un `event_id`
 * UUID; sin él es `invalid` (400, sin consultas).
 */
export function classifyRequest(body: unknown): RequestKind {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { kind: 'invalid' }
  const b = body as Record<string, unknown>
  if (b.event_type === 'OpsAlert') return { kind: 'ops' }
  const id = b.event_id
  if (typeof id === 'string' && UUID.test(id)) return { kind: 'event', eventId: id.toLowerCase() }
  return { kind: 'invalid' }
}
