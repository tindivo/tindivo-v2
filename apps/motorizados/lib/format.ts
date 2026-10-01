import { serviceDate } from '@tindivo/contracts'

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

export function formatDeliveryDate(iso: string): string {
  const d = new Date(iso)
  const timeStr = hourOf(iso)
  if (isToday(iso)) {
    return `Hoy a las ${timeStr}`
  }
  const dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
  return `${dateStr} a las ${timeStr}`
}

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const diaLima = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Lima',
})
/**
 * La hora del pedido, y el día SOLO cuando no es de esta noche.
 *
 * Un pedido cobrado ayer y todavía sin cerrar sigue en esta lista a propósito
 * (la confirmación es humana y nadie la fuerza a las 24h). Pero mezclado con los
 * de esta noche y mostrando solo «19:40», se lee como uno de hoy. El día lo
 * separa sin sacarlo de la lista.
 *
 * SE COMPARA POR JORNADA, NO POR FECHA DE CALENDARIO. El endpoint que alimenta
 * esta pantalla ya lleva escrito por qué no filtra por el día de Lima —"ese
 * dinero desaparecía de la pantalla a medianoche sin que nada hubiera pasado"—
 * y aquí quedaba la otra mitad: a las 00:00, con el motorizado todavía
 * repartiendo, todo lo de esa noche se rotulaba «ayer». `serviceDate` corta a
 * las 05:00, igual que `current_service_date` en la base.
 */
export function cuando(iso: string | null): { hora: string; dia: string | null } | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const hoy = serviceDate()
  const suyo = serviceDate(new Date(t))
  if (suyo === hoy) return { hora: horaLima.format(t), dia: null }
  const ayer = serviceDate(new Date(Date.now() - 86_400_000))
  return { hora: horaLima.format(t), dia: suyo === ayer ? 'ayer' : diaLima.format(t) }
}
