export function soles(n: number | null | undefined): string {
  return n == null ? '—' : `S/ ${Number(n).toFixed(2)}`
}

export function firstName(name: string): string {
  return name.split(' ')[0] || 'vecino'
}

/**
 * Cuenta regresiva en formato `Xd HH:MM:SS`.
 *
 * No se reusa `mmss()` de checkout: solo formatea minutos y segundos, así que
 * para los ~4 días que faltan hasta el lanzamiento devolvería "5760:00".
 * Satura en cero — nunca cuenta hacia atrás en negativo.
 */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
