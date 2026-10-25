/**
 * Ejecuta `task` solo si no hay otra en curso con el mismo candado; si la hay,
 * no hace nada y devuelve false. El candado se libera al terminar, también si
 * `task` lanza.
 */
export async function runExclusive(
  lock: { current: boolean },
  task: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false
  lock.current = true
  try {
    await task()
    return true
  } finally {
    lock.current = false
  }
}
