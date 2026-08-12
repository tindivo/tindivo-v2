/**
 * CORS: el navegador solo acepta un ORIGEN CONCRETO cuando hay credenciales.
 *
 * LO QUE ESTO AMARRA. `packages/api-client` manda `credentials: 'include'` en
 * todas las peticiones, así que cualquier respuesta con
 * `Access-Control-Allow-Origin: *` la bloquea el navegador — el comodín no es
 * "permisivo", es INSERVIBLE para este cliente. El 2026-08-12 eso tumbó el
 * registro del piloto en producción por dos motivos a la vez:
 *
 *   1. `apps/api/next.config.ts` ponía el comodín a mano sobre `/api/:path*`,
 *      pisando lo que las rutas calculaban bien. Ya no existe ese bloque.
 *   2. La lista de orígenes tenía el ápex `tindivo.com` pero NO
 *      `www.tindivo.com`, que es donde se sirve la web.
 *
 * Es una función pura y no había un solo test suyo, mientras decidía si la
 * aplicación entera es alcanzable desde el navegador. Estos tests son baratos y
 * cubren justo el fallo que llegó a producción.
 */
import { describe, expect, it } from 'vitest'
import { corsHeaders, handleOptions } from '../http/cors'

function pedir(origin: string | null): Record<string, string> {
  const headers = new Headers()
  if (origin) headers.set('origin', origin)
  return corsHeaders(new Request('https://apiv2.tindivo.com/api/v1/public/businesses', { headers }))
}

describe('CORS · el origen que el navegador exige', () => {
  it.each([
    ['https://www.tindivo.com', 'la web pública, que es donde entran los vecinos'],
    ['https://tindivo.com', 'el ápex, por si el DNS cambia de sitio'],
    ['https://negocios.tindivo.com', 'la cajera'],
    ['https://motorizados.tindivo.com', 'el motorizado'],
    ['https://admin.tindivo.com', 'el panel interno'],
  ])('%s se devuelve tal cual (%s)', (origin) => {
    const h = pedir(origin)
    expect(h['access-control-allow-origin']).toBe(origin)
    // Sin esto el navegador descarta la respuesta aunque el origen sea correcto.
    expect(h['access-control-allow-credentials']).toBe('true')
  })

  it('NUNCA devuelve el comodín a un origen conocido: con credenciales no sirve', () => {
    for (const origin of ['https://www.tindivo.com', 'https://negocios.tindivo.com']) {
      expect(pedir(origin)['access-control-allow-origin']).not.toBe('*')
    }
  })

  it('un origen ajeno no recibe permiso de credenciales', () => {
    const h = pedir('https://sitio-de-otro.com')
    // El spec prohíbe la pareja comodín + credenciales, y emitirla era el
    // segundo defecto del bloque que vivía en `next.config.ts`.
    expect(h['access-control-allow-credentials']).toBeUndefined()
  })

  it('localhost entra, para poder desarrollar contra la API', () => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3002']) {
      expect(pedir(origin)['access-control-allow-origin']).toBe(origin)
    }
  })

  it('`Vary: Origin` viaja siempre: sin él una caché sirve el origen del vecino', () => {
    expect(pedir('https://www.tindivo.com').vary).toBe('Origin')
    expect(pedir(null).vary).toBe('Origin')
  })

  it('las cabeceras que manda `api-client` están todas permitidas', () => {
    const permitidas = pedir('https://www.tindivo.com')['access-control-allow-headers']
    // Las cuatro que pone `packages/api-client/src/index.ts`. Si alguien añade
    // una quinta allí y se olvida de aquí, el preflight la rechaza.
    for (const h of ['authorization', 'content-type', 'idempotency-key', 'x-request-id']) {
      expect(permitidas).toContain(h)
    }
  })

  it('el preflight responde 204 y con las mismas reglas', async () => {
    const headers = new Headers({ origin: 'https://www.tindivo.com' })
    const res = handleOptions(
      new Request('https://apiv2.tindivo.com/api/v1/public/pilot-access', {
        method: 'OPTIONS',
        headers,
      }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.tindivo.com')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })
})
