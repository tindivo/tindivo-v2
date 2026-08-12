/**
 * Formato de la información del directorio que ve la cajera.
 *
 * Vive aparte de `format.ts` porque ese archivo es del envío del pedido
 * (idempotencia, errores, montos) y esto es de la lectura del directorio. Son
 * dos ciclos de vida distintos.
 */

/**
 * "ayer", "hace 3 semanas" — la antigüedad de uso que el modal muestra para
 * desempatar entre dos direcciones del mismo cliente.
 *
 * Se redondea a la unidad grande a propósito: a la cajera le sirve saber si fue
 * "esta semana" o "hace meses", no el número exacto de días. Con el cliente al
 * teléfono, un texto que se lee de un vistazo vale más que uno preciso.
 */
export function relativeLastUsed(iso: string | null): string {
  if (!iso) return 'sin usar'

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'sin usar'

  const days = Math.floor((Date.now() - then) / 86_400_000)

  // Negativo = fecha futura. No debería pasar, pero un reloj desfasado no puede
  // producir "hace -3 días" en la pantalla.
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`

  const weeks = Math.floor(days / 7)
  if (weeks === 1) return 'hace 1 semana'
  if (days < 30) return `hace ${weeks} semanas`

  const months = Math.floor(days / 30)
  if (months === 1) return 'hace 1 mes'
  if (months < 12) return `hace ${months} meses`

  const years = Math.floor(days / 365)
  return years === 1 ? 'hace 1 año' : `hace ${years} años`
}

/** "22 pedidos" / "1 pedido" / "" cuando nunca se usó. */
export function timesUsedLabel(timesUsed: number): string {
  if (timesUsed <= 0) return ''
  return timesUsed === 1 ? '1 pedido' : `${timesUsed} pedidos`
}

/** Inicial para el avatar del encabezado. */
export function initialOf(name: string | null): string {
  const first = name?.trim()?.[0]
  return first ? first.toUpperCase() : '?'
}

/** `987654321` → `987 654 321`, que es como se lee un celular en voz alta. */
export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  if (clean.length !== 9) return phone
  return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`
}
