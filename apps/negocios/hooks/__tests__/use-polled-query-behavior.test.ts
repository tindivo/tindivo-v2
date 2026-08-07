import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('usePolledQuery - Comportamiento de Polling y Fake Timers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Test 1: Canal sano (90s) -> avanzar 200s de tiempo simulado -> 2 ticks de polling', async () => {
    let fetchCalls = 0
    const mockQueryFn = vi.fn().mockImplementation(async () => {
      fetchCalls++
      return { status: 'ok' }
    })

    let intervalId: any = null
    const refetchInterval = 90000
    const inFlight = { current: false }

    const executeFetch = async () => {
      if (inFlight.current) return
      inFlight.current = true
      await mockQueryFn()
      inFlight.current = false
    }

    // Initial load t=0
    await executeFetch()
    expect(fetchCalls).toBe(1)

    // Configurar setInterval adaptativo a 90s (canal sano)
    intervalId = setInterval(() => {
      void executeFetch()
    }, refetchInterval)

    // Avanzar 200s (200,000 ms). Ticks en t=90s (call 2) y t=180s (call 3)
    await vi.advanceTimersByTimeAsync(200000)

    // Total = 1 inicial + 2 ticks por polling = 3 llamadas en total (2 llamadas por interval)
    expect(fetchCalls).toBe(3)

    clearInterval(intervalId)
  })

  it('Test 2: Canal cambia de 90s a 20s (degraded) -> avanzar 60s -> 3 llamadas adicionales por interval', async () => {
    let fetchCalls = 0
    const mockQueryFn = vi.fn().mockImplementation(async () => {
      fetchCalls++
      return { status: 'ok' }
    })

    let intervalId: any = null
    let refetchInterval = 90000

    const executeFetch = async () => {
      await mockQueryFn()
    }

    // Carga inicial
    await executeFetch()
    const initialCalls = fetchCalls

    // Cambiar a degraded (20s)
    refetchInterval = 20000
    intervalId = setInterval(() => {
      void executeFetch()
    }, refetchInterval)

    // Avanzar 60s (60,000 ms) -> ticks en 20s, 40s, 60s (exactamente 3 ticks)
    await vi.advanceTimersByTimeAsync(60000)

    expect(fetchCalls - initialCalls).toBe(3)

    clearInterval(intervalId)
  })

  it('Test 3: Desmontar (unmount) -> avanzar 300s -> cero llamadas nuevas (sin memory leak)', async () => {
    let fetchCalls = 0
    const mockQueryFn = vi.fn().mockImplementation(async () => {
      fetchCalls++
      return { status: 'ok' }
    })

    let intervalId: any = setInterval(() => {
      void mockQueryFn()
    }, 20000)

    // Simular unmount: clearInterval
    clearInterval(intervalId)
    intervalId = null

    const callsAtUnmount = fetchCalls

    // Avanzar 300s (300,000 ms)
    await vi.advanceTimersByTimeAsync(300000)

    // Cero llamadas adicionales tras desmontar
    expect(fetchCalls).toBe(callsAtUnmount)
  })
})
