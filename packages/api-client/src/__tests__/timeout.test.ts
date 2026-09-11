import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiTimeoutError, createApiClient, DEFAULT_TIMEOUT_MS } from '../index'

/**
 * El plazo del cliente de API.
 *
 * POR QUÉ ESTO TIENE TEST Y NO SE DEJA A LA REVISIÓN. Lo que se prueba aquí no
 * es una regla de negocio sino la AUSENCIA de un cuelgue, y un cuelgue no
 * aparece en ninguna pantalla de error: se disfraza de «cargando» para
 * siempre. Así se perdió un pedido en prod el 2026-09-09. Si alguien vuelve a
 * quitar el plazo, o lo pone después de leer el cuerpo, nada se pone rojo solo.
 */

/**
 * Un `fetch` que nunca contesta y solo termina si le abortan la señal.
 *
 * Atiende la señal YA abortada además del evento, igual que el `fetch` real: sin
 * eso, abortar antes de que la petición salga —que es lo que pasa cuando quien
 * llama cancela durante el `await` de las cabeceras— no rechazaría nunca, y el
 * test se colgaría culpando al código en vez de al doble.
 */
function fetchQueSeCuelga(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      const abortar = () => reject(new Error('AbortError'))
      if (signal.aborted) abortar()
      else signal.addEventListener('abort', abortar, { once: true })
    })) as unknown as typeof fetch
}

function fetchQueContesta(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

const originalFetch = globalThis.fetch

describe('plazo del cliente de API', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  it('corta una petición que no vuelve y la reporta como plazo agotado', async () => {
    globalThis.fetch = fetchQueSeCuelga()
    const api = createApiClient({ baseUrl: 'https://x/api/v1', timeoutMs: 1_000 })

    const pendiente = api.request('/public/businesses/abc').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1_000)

    const err = await pendiente
    expect(err).toBeInstanceOf(ApiTimeoutError)
    expect((err as ApiTimeoutError).path).toBe('/public/businesses/abc')
    expect((err as ApiTimeoutError).timeoutMs).toBe(1_000)
  })

  it('un plazo agotado NO es un ApiError: no hubo veredicto del servidor', async () => {
    globalThis.fetch = fetchQueSeCuelga()
    const api = createApiClient({ baseUrl: 'https://x/api/v1', timeoutMs: 500 })

    const pendiente = api.request('/customer/orders', { method: 'POST', body: {} }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(500)

    // De esta distinción depende que el checkout CONSERVE la clave de
    // idempotencia (resultado desconocido) en vez de regenerarla como hace con
    // los 4xx. Ver `use-checkout-actions.ts`.
    expect(await pendiente).not.toBeInstanceOf(ApiError)
  })

  it('el plazo de quien llama no se confunde con el del cliente', async () => {
    globalThis.fetch = fetchQueSeCuelga()
    const api = createApiClient({ baseUrl: 'https://x/api/v1', timeoutMs: 10_000 })
    const ctrl = new AbortController()

    const pendiente = api.request('/x', { signal: ctrl.signal }).catch((e: unknown) => e)
    ctrl.abort()

    const err = await pendiente
    expect(err).not.toBeInstanceOf(ApiTimeoutError)
  })

  it('una respuesta normal no queda marcada por el plazo', async () => {
    globalThis.fetch = fetchQueContesta({ data: { ok: true } })
    const api = createApiClient({ baseUrl: 'https://x/api/v1', timeoutMs: 1_000 })

    await expect(api.request('/x')).resolves.toEqual({ data: { ok: true } })

    // Si el temporizador siguiera vivo, avanzar el reloj abortaría una petición
    // ya terminada y dejaría un abort suelto en la consola del cliente.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('`timeoutMs: 0` desactiva el plazo para quien lo pida explícitamente', async () => {
    globalThis.fetch = fetchQueSeCuelga()
    const api = createApiClient({ baseUrl: 'https://x/api/v1', timeoutMs: 0 })

    let resuelto = false
    void api.request('/x').then(
      () => {
        resuelto = true
      },
      () => {
        resuelto = true
      },
    )
    await vi.advanceTimersByTimeAsync(60_000)

    expect(resuelto).toBe(false)
  })

  it('el plazo por defecto existe aunque nadie lo configure', async () => {
    globalThis.fetch = fetchQueSeCuelga()
    const api = createApiClient({ baseUrl: 'https://x/api/v1' })

    const pendiente = api.get('/x').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS)

    expect(await pendiente).toBeInstanceOf(ApiTimeoutError)
  })
})
