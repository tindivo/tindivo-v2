import { isPilotActive, PILOT_FORM_URL } from '@tindivo/contracts'
import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

/** Texto único de rechazo. Mismo mensaje en los dos gates, a propósito. */
export const PILOT_REJECTION_DETAIL =
  `Tindivo todavía está en piloto cerrado con un grupo de vecinos invitados. ` +
  `Abrimos para todos el viernes 14 de agosto a las 6:00 p.m. ` +
  `Si quieres entrar antes, déjanos tu número aquí: ${PILOT_FORM_URL}`

/**
 * Pasa un teléfono a los 9 dígitos canónicos de `PhonePeSchema`.
 *
 * Hace falta porque el esquema guarda dos formatos: `customer_profiles.phone` es
 * E.164 (`+51999888777`) y `pilot_whitelist.phone` son 9 dígitos (`999888777`).
 * Tolera también el `51` pelado y los separadores, igual que `PhonePeSchema`.
 */
export function toPhone9(phone: string | null | undefined): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^\+?51/, '')
  return /^9\d{8}$/.test(cleaned) ? cleaned : null
}

/**
 * ¿Este número puede operar ahora mismo?
 *
 * - Piloto cerrado  -> solo si está en `pilot_whitelist` con `active = true`.
 * - Piloto abierto  -> siempre, y NO se consulta la tabla.
 *
 * FALLA CERRADO a propósito: si la consulta revienta o el teléfono no normaliza a
 * 9 dígitos, deniega. Durante el piloto es preferible dejar fuera a un invitado
 * (que puede escribir por WhatsApp) que abrirle la puerta a todo el pueblo por un
 * error de red. Después de `PILOT_LAUNCH_AT` esta rama ni se alcanza.
 */
export async function isPhoneAllowed(
  service: ServiceClient,
  phone: string | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isPilotActive(now)) return true

  const phone9 = toPhone9(phone)
  if (!phone9) return false

  const { data, error } = await service
    .from('pilot_whitelist')
    .select('phone')
    .eq('phone', phone9)
    .eq('active', true)
    .maybeSingle()

  if (error) {
    console.error('[pilot] fallo al consultar pilot_whitelist:', error.message)
    return false
  }
  return data != null
}
