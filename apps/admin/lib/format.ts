/** Formatea soles peruanos; null/undefined → guion. */
export const soles = (n: number | null | undefined) =>
  n == null ? '—' : `S/ ${Number(n).toFixed(2)}`

/** Entero con separador de miles (es-PE). */
export const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE')

/** Fecha-hora local PE corta. */
export const dateTime = (iso: string) => new Date(iso).toLocaleString('es-PE')
