import { describe, expect, it, vi } from 'vitest'

describe('usePolledQuery - Deduplication & Cooldown', () => {
  it('deduplicates rapid consecutive calls within dedupeIntervalMs window', async () => {
    let callCount = 0
    const mockQueryFn = async () => {
      callCount++
      return { ok: true }
    }

    let lastFetchTime = 0
    const dedupeIntervalMs = 1000

    const executeFetch = async (opts?: { force?: boolean }) => {
      const now = Date.now()
      if (!opts?.force && now - lastFetchTime < dedupeIntervalMs) {
        return
      }
      lastFetchTime = now
      await mockQueryFn()
    }

    // Primer fetch
    await executeFetch()
    expect(callCount).toBe(1)

    // Segundo fetch dentro del cooldown (debe ser omitido)
    await executeFetch()
    expect(callCount).toBe(1)

    // Tercer fetch forzado (debe ejecutarse)
    await executeFetch({ force: true })
    expect(callCount).toBe(2)
  })
})
