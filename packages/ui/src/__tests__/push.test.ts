import { afterEach, describe, expect, it, vi } from 'vitest'
import { dropLocalPushSubscription, unsubscribeFromPush } from '../push'

/**
 * `unsubscribeFromPush` y `dropLocalPushSubscription` los llaman las CUATRO apps
 * al cerrar sesión, y hasta ahora no los sostenía nada: el e2e del motorizado
 * ejercita el logout, pero por el hook propio de esa app, no por estos helpers.
 *
 * Lo que se prueba aquí es lo que no se ve mirando la pantalla:
 *
 *   · el ORDEN (backend primero, navegador después) y que un DELETE fallido no
 *     toque nada local — al revés quedaría una fila viva apuntando a un endpoint
 *     muerto, y el backend seguiría enviándole hasta que el proveedor devolviera
 *     410;
 *   · que NUNCA lancen, porque quien los llama es el botón de cerrar sesión y
 *     salir tiene que funcionar aunque no haya red;
 *   · que el techo de `serviceWorker.ready` corte de verdad. Esa promesa no
 *     resuelve NI rechaza si el SW no llegó a registrarse (404 de `/sw.js`, modo
 *     privado), así que sin el techo cerrar sesión se cuelga para siempre. Un
 *     bug que en producción se ve como "el botón no hace nada".
 *
 * El entorno es node, así que los globals del navegador se montan a mano: es
 * más barato que arrastrar jsdom para tres objetos, y deja a la vista qué es
 * exactamente lo que estas funciones necesitan del navegador.
 */

interface SubStub {
  endpoint: string
  unsubscribe: ReturnType<typeof vi.fn>
}

function suscripcion(endpoint = 'https://push.example/abc'): SubStub {
  return { endpoint, unsubscribe: vi.fn().mockResolvedValue(true) }
}

/**
 * Monta los globals que mira `pushSupported()` y devuelve el registro del SW.
 *
 * `ready` se pasa como promesa para poder simular el caso que importa: la que
 * no se resuelve nunca.
 */
function montarNavegador(opciones: {
  ready?: Promise<unknown>
  sub?: SubStub | null
  getSubscriptionLanza?: boolean
}) {
  const { sub = null, getSubscriptionLanza = false } = opciones
  const registro = {
    pushManager: {
      getSubscription: vi.fn(async () => {
        if (getSubscriptionLanza) throw new Error('boom')
        return sub
      }),
    },
  }
  const ready = opciones.ready ?? Promise.resolve(registro)
  vi.stubGlobal('navigator', { serviceWorker: { ready }, userAgent: 'vitest' })
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
  return registro
}

/** Sin `window` no hay soporte de push: es el navegador que no puede. */
function montarNavegadorSinSoporte() {
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('window', {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('unsubscribeFromPush', () => {
  it('sin soporte de push no llama al backend', async () => {
    montarNavegadorSinSoporte()
    const del = vi.fn()

    expect(await unsubscribeFromPush(del)).toBe('unsupported')
    expect(del).not.toHaveBeenCalled()
  })

  it('sin suscripción no hay nada que dar de baja, y no se llama al backend', async () => {
    montarNavegador({ sub: null })
    const del = vi.fn()

    expect(await unsubscribeFromPush(del)).toBe('nothing-to-do')
    expect(del).not.toHaveBeenCalled()
  })

  it('da de baja: primero el backend con el endpoint, después el navegador', async () => {
    const sub = suscripcion()
    montarNavegador({ sub })
    const orden: string[] = []
    const del = vi.fn(async (endpoint: string) => {
      orden.push(`del:${endpoint}`)
    })
    sub.unsubscribe.mockImplementation(async () => {
      orden.push('unsubscribe')
      return true
    })

    expect(await unsubscribeFromPush(del)).toBe('unsubscribed')
    expect(orden).toEqual(['del:https://push.example/abc', 'unsubscribe'])
  })

  it('si el DELETE falla NO se suelta la suscripción local', async () => {
    // El caso que justifica el orden. Soltarla igual dejaría una fila viva
    // apuntando a un endpoint muerto: el backend seguiría enviando avisos de
    // una cuenta de la que el usuario ya salió, hasta cobrarse un 410.
    const sub = suscripcion()
    montarNavegador({ sub })
    const del = vi.fn().mockRejectedValue(new Error('503'))

    expect(await unsubscribeFromPush(del)).toBe('failed')
    expect(sub.unsubscribe).not.toHaveBeenCalled()
  })

  it('no lanza si el navegador falla al leer la suscripción', async () => {
    montarNavegador({ getSubscriptionLanza: true })
    const del = vi.fn()

    expect(await unsubscribeFromPush(del)).toBe('failed')
    expect(del).not.toHaveBeenCalled()
  })

  it('no se cuelga si `serviceWorker.ready` no resuelve nunca', async () => {
    // El techo de 3 s. Sin él, cerrar sesión espera para siempre.
    vi.useFakeTimers()
    montarNavegador({ ready: new Promise(() => {}) })
    const del = vi.fn()

    const pendiente = unsubscribeFromPush(del)
    await vi.advanceTimersByTimeAsync(3_000)

    expect(await pendiente).toBe('nothing-to-do')
    expect(del).not.toHaveBeenCalled()
  })
})

describe('dropLocalPushSubscription', () => {
  it('suelta la suscripción local SIN avisar al backend', async () => {
    // Es su única diferencia con `unsubscribeFromPush`, y la razón de existir:
    // en «cerrar sesión en todos» las filas ya se borraron de golpe con
    // `{ all: true }`, así que un DELETE por endpoint sería una petición de más
    // contra una fila que ya no existe.
    const sub = suscripcion()
    montarNavegador({ sub })

    expect(await dropLocalPushSubscription()).toBe(true)
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('devuelve false sin soporte, sin registro a tiempo o sin suscripción', async () => {
    montarNavegadorSinSoporte()
    expect(await dropLocalPushSubscription()).toBe(false)

    vi.unstubAllGlobals()
    montarNavegador({ sub: null })
    expect(await dropLocalPushSubscription()).toBe(false)
  })

  it('no lanza si el navegador falla', async () => {
    montarNavegador({ getSubscriptionLanza: true })
    expect(await dropLocalPushSubscription()).toBe(false)
  })
})
