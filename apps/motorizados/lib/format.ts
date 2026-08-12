export const soles = (n: number | null | undefined) =>
  n == null ? '—' : `S/ ${Number(n).toFixed(2)}`

/** Segundos -> "MM:SS" si < 60 min, "Xh Ym" si >= 60 min. Preserva el signo. */
export function mmss(totalSeconds: number): string {
  const isNeg = totalSeconds < 0
  const absSec = Math.abs(Math.round(totalSeconds))
  const sign = isNeg ? '-' : ''

  if (absSec >= 3600) {
    const hours = Math.floor(absSec / 3600)
    const mins = Math.floor((absSec % 3600) / 60)
    return `${sign}${hours}h ${String(mins).padStart(2, '0')}m`
  }

  const mm = String(Math.floor(absSec / 60)).padStart(2, '0')
  const ss = String(absSec % 60).padStart(2, '0')
  return `${sign}${mm}:${ss}`
}

export function minutesUntil(iso: string, now: number): number {
  return Math.round((Date.parse(iso) - now) / 60_000)
}

export function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const t = new Date()
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  )
}

export const PAYMENT_LABEL: Record<string, string> = {
  prepaid: 'Prepago Yape',
  pending_yape: 'Yape al recibir',
  pending_cash: 'Efectivo',
  pending_mixed: 'Mixto',
}

export const hourOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

/**
 * `987654123` -> `+51 987 654 123`.
 *
 * Los tríos no son estética: el motorizado lee este número en voz alta o lo
 * teclea con guantes, y agrupado se equivoca menos.
 *
 * Vive aquí porque hace falta en los DOS momentos en que se usa un teléfono, y
 * estaba solo en uno: la ficha de previsualización lo agrupaba y la tarjeta del
 * cliente —la que se mira en la puerta, que es cuando de verdad se llama— lo
 * pintaba crudo.
 */
export function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(-9)
  return d.length === 9 ? `+51 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : raw
}
