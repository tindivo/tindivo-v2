/**
 * Dinero de salida para los campos NUEVOS de la API (D-39): texto con dos
 * decimales, `"12.50"`. Acepta lo que guarda `app_settings` (número JSON o
 * cadena numérica) y devuelve `null` si no es un monto válido: un valor roto
 * en la base no debe volverse un `"NaN"` en la app.
 */
export function toMoneyText(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n.toFixed(2)
}
