/** Lo que admite un número de WhatsApp escrito a mano: dígitos, un `+` delante, espacios, guiones y paréntesis. */
const WRITTEN_PHONE = /^\+?[\d\s()-]+$/

/** E.164: el número completo, con el código de país, tiene a lo sumo 15 dígitos. */
const MAX_DIGITS = 15

/**
 * Mínimo de dígitos, el mismo de la web (`apps/customer/lib/support.ts`): por debajo, el enlace `wa.me` no llega a
 * nadie.
 */
const MIN_DIGITS = 9

/**
 * El número de WhatsApp de `app_settings` solo con dígitos, listo para `https://wa.me/<número>` (`"+51 906 550 166"`
 * → `"51906550166"`). Devuelve `null` si falta, no es texto o no tiene forma de número: la app usa su respaldo, y un
 * valor roto en la base nunca se vuelve un enlace que no lleva a nadie.
 */
export function toWhatsappDigits(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const written = value.trim()
  if (!WRITTEN_PHONE.test(written)) return null
  const digits = written.replace(/\D/g, '')
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS ? digits : null
}
