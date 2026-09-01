/**
 * Estrecha `T | null | undefined` a `T` fallando con un mensaje que dice QUÉ
 * faltaba.
 *
 * Sustituye al `!` en los asserts de integración. No es solo cosmético: cuando
 * un fixture no se sembró, `cargo!.amount` reventaba con "Cannot read
 * properties of undefined (reading 'amount')" y mandaba a leer el assert en vez
 * del seed. Esto dice el nombre de lo que falta y para el test en el sitio
 * donde se rompió la precondición.
 */
export function requirePresent<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Falta ${what}: la precondición del test no se cumplió.`)
  }
  return value
}
