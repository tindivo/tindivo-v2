// Piezas puras de la rama `OpsAlert` de send-push, sin imports de Deno para poder
// probarlas desde vitest (apps/api/lib/__tests__/send-push-ops-alert.test.ts).

/** Cabecera con el secreto compartido de servidor (`OPS_ALERT_SECRET`). */
export const OPS_ALERT_SECRET_HEADER = 'x-ops-alert-secret'

/** Ventana mínima entre dos alertas del mismo tipo, aplicada por la base (0263). */
export const OPS_ALERT_WINDOW = '30 minutes'

/**
 * Alertas operativas permitidas (`kind` -> texto fijo). Sin prototipo: con un
 * objeto literal, `'constructor'` o `'__proto__'` existirían por herencia.
 */
const OPS_ALERTS: Record<string, { title: string; body: string }> = Object.assign(
  Object.create(null) as Record<string, { title: string; body: string }>,
  {
    otp_phone_limit_misconfigured: {
      title: 'Tindivo: verificación por SMS bloqueada',
      body: 'Falta configurar el límite de SMS por número. Revisa las variables en Vercel.',
    },
  },
)

/** El texto fijo de un `kind` conocido, o `undefined` si no está en la lista. */
export function opsAlertText(kind: unknown): { title: string; body: string } | undefined {
  if (typeof kind !== 'string') return undefined
  return Object.hasOwn(OPS_ALERTS, kind) ? OPS_ALERTS[kind] : undefined
}

/**
 * ¿La petición viene de un emisor interno? Compara en tiempo constante (sin
 * salir en el primer byte distinto) la cabecera con el secreto de la función.
 * Sin secreto configurado rechaza TODO: falla cerrado.
 */
export function isOpsCaller(headerValue: string | null, secret: string | undefined): boolean {
  if (!secret || headerValue === null) return false
  const enc = new TextEncoder()
  const a = enc.encode(headerValue)
  const b = enc.encode(secret)
  // Se recorre siempre el largo del secreto; la diferencia de tamaño también cuenta.
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
