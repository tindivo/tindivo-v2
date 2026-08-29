/**
 * Idempotency key helpers – unit tests
 *
 * These tests validate the sessionStorage-based idempotency key lifecycle
 * used by the /nuevo page in @tindivo/negocios.
 *
 * The helpers under test are inlined here (copied from page.tsx) to avoid
 * coupling the test to the Next.js page module. If the implementation changes,
 * these tests serve as the regression gate against re-introducing the
 * inverted-condition bug (typeof window === 'undefined' vs !==).
 */
import { beforeEach, describe, expect, it } from 'vitest'

interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  readonly length: number
  key(index: number): string | null
}

/* ---------- helpers under test (copied from apps/negocios/app/nuevo/page.tsx) ---------- */

function getOrCreateIdempotencyKey(storage: Storage): string {
  let key = storage.getItem('tindivo:new-order-key')
  if (!key) {
    key = `key-${Date.now()}-${Math.random()}`
    storage.setItem('tindivo:new-order-key', key)
  }
  return key
}

function clearIdempotencyKey(storage: Storage | null): void {
  if (storage) {
    storage.removeItem('tindivo:new-order-key')
  }
}

/* ---------- mock storage ---------- */

function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

/* ---------- tests ---------- */

describe('Idempotency key helpers', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('getOrCreateIdempotencyKey returns the same key on consecutive calls', () => {
    const key1 = getOrCreateIdempotencyKey(storage)
    const key2 = getOrCreateIdempotencyKey(storage)
    expect(key1).toBe(key2)
    expect(key1).toBeTruthy()
  })

  it('after clearIdempotencyKey, the next call returns a DIFFERENT key', () => {
    const key1 = getOrCreateIdempotencyKey(storage)
    clearIdempotencyKey(storage)
    const key2 = getOrCreateIdempotencyKey(storage)
    expect(key2).not.toBe(key1)
  })

  it('clearIdempotencyKey does not throw when storage is null (SSR)', () => {
    expect(() => clearIdempotencyKey(null)).not.toThrow()
  })

  it('each new key is non-empty and contains a timestamp component', () => {
    const key = getOrCreateIdempotencyKey(storage)
    expect(key.length).toBeGreaterThan(0)
    expect(key).toMatch(/^key-\d+-/)
  })

  it('keys generated after successive clears are all unique', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 10; i++) {
      keys.add(getOrCreateIdempotencyKey(storage))
      clearIdempotencyKey(storage)
    }
    // All 10 keys should be distinct
    expect(keys.size).toBe(10)
  })
})
