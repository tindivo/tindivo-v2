import { describe, expect, it, vi } from 'vitest'
import { runExclusive } from '../run-exclusive'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('runExclusive', () => {
  it('ignora una segunda llamada mientras la primera sigue en curso', async () => {
    const lock = { current: false }
    const gate = deferred()
    const task = vi.fn(() => gate.promise)

    const first = runExclusive(lock, task)
    const second = runExclusive(lock, task)

    expect(await second).toBe(false)
    expect(task).toHaveBeenCalledTimes(1)
    gate.resolve()
    expect(await first).toBe(true)
  })

  it('libera el candado al terminar y permite otro intento', async () => {
    const lock = { current: false }
    const task = vi.fn(async () => {})

    expect(await runExclusive(lock, task)).toBe(true)
    expect(lock.current).toBe(false)
    expect(await runExclusive(lock, task)).toBe(true)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('libera el candado aunque la tarea lance', async () => {
    const lock = { current: false }

    await expect(
      runExclusive(lock, async () => {
        throw new Error('falló')
      }),
    ).rejects.toThrow('falló')
    expect(lock.current).toBe(false)
  })
})
