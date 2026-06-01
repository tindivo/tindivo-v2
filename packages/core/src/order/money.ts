/**
 * Aritmética de dinero en céntimos para evitar errores de coma flotante.
 * El dominio trabaja en Soles (number con 2 decimales); estas funciones
 * garantizan redondeo estable (0.1 + 0.2 = 0.30, no 0.30000000000000004).
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/** Redondea a 2 decimales de forma estable. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** Suma montos en céntimos y devuelve Soles (evita drift de coma flotante). */
export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0))
}

/** Resta b de a en céntimos. */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b))
}
