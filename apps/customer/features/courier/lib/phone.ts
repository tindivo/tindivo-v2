/**
 * Cuántos dígitos le faltan a un celular peruano (9 dígitos, empieza en 9) —
 * para el aviso en vivo "Faltan N dígitos" de `TripDetailsSheet`. Mismo
 * criterio que `PhonePeSchema` (`packages/contracts/src/primitives.ts`), pero
 * como conteo de dígitos en el cliente: no hace falta traer zod al navegador
 * solo para esto, ni lanzar/atrapar un `safeParse` en cada tecla.
 */
export function missingPhoneDigits(phone: string): number {
  const digits = phone.replace(/[^\d]/g, '').replace(/^51/, '')
  return Math.max(0, 9 - digits.length)
}

export function isValidPePhone(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, '').replace(/^51/, '')
  return /^9\d{8}$/.test(digits)
}

/**
 * Solo los 9 dígitos locales, sin el `+51`/`51` — lo que de verdad va en el
 * campo "Celular" de `TripDetailsSheet`, que ya pinta su propio "+51" fijo al
 * costado. `customer_profiles.phone` no es consistente en cómo lo guarda (el
 * seed de e2e tiene filas con y sin el prefijo): sin esto, precargar el
 * celular desde `identity.phone` a veces duplicaba el prefijo en pantalla
 * ("+51 +51900000003").
 */
export function stripPeCountryCode(phone: string): string {
  return phone.replace(/[^\d]/g, '').replace(/^51(?=\d{9}$)/, '')
}

/**
 * Lo que queda en el campo «Celular» tras cada tecla: solo dígitos y nunca más
 * de 9. Si pegan un número con el prefijo (`+51 987 654 321`) se le quita; sin
 * este tope se podían seguir escribiendo dígitos y el aviso «Faltan N» nunca
 * decía que sobraban.
 */
export function normalizePePhoneInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  const local = digits.length > 9 && digits.startsWith('51') ? digits.slice(2) : digits
  return local.slice(0, 9)
}

/** «911 111 111»: de a tres, como se dicta. Para mostrarlo, no para el campo. */
export function formatPePhone(phone: string): string {
  return stripPeCountryCode(phone).replace(/(\d{3})(?=\d)/g, '$1 ')
}
