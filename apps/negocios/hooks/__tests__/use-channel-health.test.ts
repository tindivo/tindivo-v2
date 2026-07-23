import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowser: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => {} }),
      subscribe: () => {},
    }),
    removeChannel: () => {},
  }),
}))

import { getBackoffDelayMs } from '../use-channel-health'

describe('useChannelHealth - Exponential Backoff', () => {
  it('calculates exponential backoff delay correctly with cap at 30s', () => {
    expect(getBackoffDelayMs(0)).toBe(1000)  // 1s
    expect(getBackoffDelayMs(1)).toBe(2000)  // 2s
    expect(getBackoffDelayMs(2)).toBe(4000)  // 4s
    expect(getBackoffDelayMs(3)).toBe(8000)  // 8s
    expect(getBackoffDelayMs(4)).toBe(16000) // 16s
    expect(getBackoffDelayMs(5)).toBe(30000) // cap 30s
    expect(getBackoffDelayMs(10)).toBe(30000) // cap 30s
  })
})
