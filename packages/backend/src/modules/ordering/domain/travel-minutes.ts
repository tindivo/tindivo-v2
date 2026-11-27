/**
 * El trayecto del cliente (`app_settings.timers`: `travelMinutesMin` y `travelMinutesMax`).
 * `null` si falta alguno o no es un entero coherente: sin ajuste no se inventa un rango (la app no muestra nada).
 */
export function travelMinutesFrom(timers: unknown): { min: number; max: number } | null {
  const v = (timers ?? {}) as { travelMinutesMin?: unknown; travelMinutesMax?: unknown }
  const { travelMinutesMin: min, travelMinutesMax: max } = v
  if (typeof min !== 'number' || typeof max !== 'number') return null
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) return null
  return { min, max }
}
