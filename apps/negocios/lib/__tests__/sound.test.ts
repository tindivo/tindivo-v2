import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createKitchenSoundTrigger,
  NEGOCIOS_SOUNDS,
  playKitchenSound,
  playNegociosSound,
} from '../sound'

describe('Negocios sound utilities', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    ;(globalThis as unknown as { window: unknown }).window = originalWindow
  })

  it('declara la ruta correcta para el sonido de cocina', () => {
    expect(NEGOCIOS_SOUNDS.kitchen).toBe('/sounds/notication-tindivo-levelup.mp3')
  })

  it('no arroja error en entornos sin window (SSR)', () => {
    delete (globalThis as unknown as { window?: unknown }).window
    expect(() => playKitchenSound()).not.toThrow()
    expect(() => createKitchenSoundTrigger()()).not.toThrow()
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

    const trigger = createKitchenSoundTrigger(0.7)
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(mockPlay).not.toHaveBeenCalled()

    trigger()
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('playNegociosSound reproduce el archivo configurado cuando hay soporte', () => {
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

    playNegociosSound('kitchen', 0.8)
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

    const trigger = createKitchenSoundTrigger()
    expect(() => trigger()).not.toThrow()
  })
})
