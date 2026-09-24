export function formatCourierPrice(amount: number): string {
  return `S/ ${amount.toFixed(2).replace(/\.00$/, '')}`
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return ''
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

export function formatReadyIn(minutes: number): string {
  return minutes <= 0 ? 'Ya' : `${minutes} min`
}

/** `?src=` de la URL actual, para `funnel_events`/medición del embudo (spec v1 §9). */
export function getUtmSource(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('src')
}
