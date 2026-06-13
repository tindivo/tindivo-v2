export const soles = (n: number | null | undefined) =>
  n == null ? '—' : `S/ ${Number(n).toFixed(2)}`

/** Segundos -> "MM:SS" (clamp a 0). */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
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
