export function formatCourierPrice(amount: number): string {
  return `S/ ${amount.toFixed(2).replace(/\.00$/, '')}`
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return ''
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

/** `?src=` de la URL actual, para `funnel_events`/medición del embudo (spec v1 §9). */
export function getUtmSource(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('src')
}

/** «18:00» → «6 pm», «18:30» → «6:30 pm». */
function hourLabel(hhmm: string): { text: string; meridiem: 'am' | 'pm' } {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const meridiem = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { text: m ? `${h12}:${String(m).padStart(2, '0')}` : String(h12), meridiem }
}

/**
 * El horario como se dice en voz alta: «6 a 11 pm», o «11 am a 3 pm» cuando
 * cruza el mediodía. Sale de `app_settings.courier.hours`, nunca escrito a mano.
 */
export function formatCourierHours(hours: { start: string; end: string } | null): string {
  if (!hours) return ''
  const a = hourLabel(hours.start)
  const b = hourLabel(hours.end)
  return a.meridiem === b.meridiem
    ? `${a.text} a ${b.text} ${b.meridiem}`
    : `${a.text} ${a.meridiem} a ${b.text} ${b.meridiem}`
}

/** «Abre a las 6 pm». */
export function formatOpensAt(hours: { start: string } | null): string {
  if (!hours) return 'Cerrado ahora'
  const a = hourLabel(hours.start)
  return `Abre a las ${a.text} ${a.meridiem}`
}
