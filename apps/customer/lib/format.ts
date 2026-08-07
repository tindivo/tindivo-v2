export function soles(n: number | null | undefined): string {
  return n == null ? '—' : `S/ ${Number(n).toFixed(2)}`
}

export function firstName(name: string): string {
  return name.split(' ')[0] || 'vecino'
}
