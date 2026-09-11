import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriverAudioTrigger, DRIVER_SOUNDS, playDriverSound } from '../sound'

describe('Motorizados sound utilities', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    ;(globalThis as unknown as { window: unknown }).window = originalWindow
  })

  it('declara las rutas correctas para los sonidos de motorizado', () => {
    expect(DRIVER_SOUNDS.orderTaken).toBe('/sounds/notication-tindivo-1.mp3')
    expect(DRIVER_SOUNDS.orderDelivered).toBe('/sounds/notication-tindivo-4.mp3')
  })

  it('no arroja error en entornos sin window (SSR)', () => {
    delete (globalThis as unknown as { window?: unknown }).window
    expect(() => playDriverSound('orderTaken')).not.toThrow()
    expect(() => createDriverAudioTrigger('orderDelivered')()).not.toThrow()
  })

  it('precarga con .load() y reproduce con .play() en entorno de navegador', () => {
    const mockPlay = vi.fn().mockImplementation(() => Promise.resolve())
    const mockLoad = vi.fn()

    class MockAudio {
      src: string
      volume = 1
      play = mockPlay
      load = mockLoad
      constructor(src: string) {
        this.src = src
      }
    }

    const env = globalThis as unknown as { window: unknown; Audio: unknown }
    env.window = { Audio: MockAudio }
    env.Audio = MockAudio

    const trigger = createDriverAudioTrigger('orderTaken', 0.7)
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(mockPlay).not.toHaveBeenCalled()

    trigger()
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('playDriverSound reproduce el archivo configurado cuando hay soporte', () => {
    const mockPlay = vi.fn().mockImplementation(() => Promise.resolve())
    const mockLoad = vi.fn()

    class MockAudio {
      src: string
      volume = 1
      play = mockPlay
      load = mockLoad
      constructor(src: string) {
        this.src = src
      }
    }

    const env = globalThis as unknown as { window: unknown; Audio: unknown }
    env.window = { Audio: MockAudio }
    env.Audio = MockAudio

    playDriverSound('orderDelivered', 0.8)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('captura y silencia rechazos de play sin propagar excepciones', () => {
    const mockPlay = vi.fn().mockImplementation(() => Promise.reject(new Error('Autoplay blocked')))
    const mockLoad = vi.fn()

    class MockAudio {
      src: string
      volume = 1
      play = mockPlay
      load = mockLoad
      constructor(src: string) {
        this.src = src
      }
    }

    const env = globalThis as unknown as { window: unknown; Audio: unknown }
    env.window = { Audio: MockAudio }
    env.Audio = MockAudio

    const trigger = createDriverAudioTrigger('orderTaken')
    expect(() => trigger()).not.toThrow()
  })
})
