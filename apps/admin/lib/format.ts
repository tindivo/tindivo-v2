/** Formatea soles peruanos; null/undefined → guion. */
export const soles = (n: number | null | undefined) =>
  n == null ? '—' : `S/ ${Number(n).toFixed(2)}`

/** Entero con separador de miles (es-PE). */
export const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE')

/** Fecha-hora local PE corta. */
export const dateTime = (iso: string) => new Date(iso).toLocaleString('es-PE')

/**
 * Reparte 100 puntos porcentuales entre los conteos, por resto mayor.
 *
 * Redondear cada parte por separado no suma 100: tres tercios dan 33+33+33=99,
 * y un desglose que no cierra en 100 hace dudar del dato entero. Este reparte
 * los enteros y luego da el punto sobrante a quien tenga el mayor decimal
 * pendiente, así que la suma es exactamente 100 salvo que el total sea 0.
 */
export function sharePcts(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total <= 0) return counts.map(() => 0)

  const exact = counts.map((c) => (100 * c) / total)
  const floors = exact.map(Math.floor)
  let resto = 100 - floors.reduce((a, b) => a + b, 0)

  const orden = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)

  const out = [...floors]
  for (const { i } of orden) {
    if (resto <= 0) break
    out[i] = (out[i] ?? 0) + 1
    resto -= 1
  }
  return out
}

/** Fecha-hora en hora de Lima, corta. San Jacinto opera de noche: leer un
 *  timestamp en UTC hace dudar de la hora justo cuando importa. */
export const limaTime = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  }).format(new Date(iso))

export const limaDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  }).format(new Date(iso))

/** Duración legible: "45s", "3m 20s", "1h 12m". */
export function duracion(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const abs = Math.abs(Math.round(seconds))
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
