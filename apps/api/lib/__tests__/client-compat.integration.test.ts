/**
 * Compatibilidad app-API (lote MV3): `GET /config` y el rechazo por versión
 * mínima. Contra la base local; ver `supabase/migrations/0253`.
 *
 * LO QUE AMARRA:
 *  · `/config` responde sin sesión y sin cabeceras, con los mínimos de la base.
 *  · Una app por debajo del mínimo de SU app y SU plataforma recibe 426 con
 *    `code: client_upgrade_required`; las demás (otra app, otra plataforma, la
 *    web sin cabeceras) pasan.
 *  · `/config` y `/health` siguen abiertos aunque la app esté obsoleta.
 *  · Los mínimos salen de `app_settings`: cambiar la fila cambia el veredicto.
 */
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as getConfig } from '../../app/api/v1/config/route'
import { proxy } from '../../proxy'
import { resetClientCompatCache } from '../http/client-compat'
import { localClient as db } from './helpers/local-db'

// Los handlers construyen su cliente desde el entorno, y vitest no lo trae.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'local-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const MINIMOS = {
  minAppVersion: {
    customer: { ios: '1.2.0', android: '1.0.5' },
    negocios: { ios: '0.0.0', android: '2.0.0' },
    motorizados: { ios: '0.0.0', android: '0.0.0' },
  },
  minOs: { android: 26, ios: 17 },
}

let original: unknown = null

beforeAll(async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'client_compat').single()
  original = data?.value ?? null
  await db.from('app_settings').update({ value: MINIMOS }).eq('key', 'client_compat')
})

afterAll(async () => {
  if (original) {
    await db
      .from('app_settings')
      .update({ value: original as never })
      .eq('key', 'client_compat')
  }
})

beforeEach(() => resetClientCompatCache())

function pedir(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3001${path}`, { headers })
}

/** `NextResponse.next()` marca el paso con esta cabecera; un rechazo trae su propio estado. */
function pasa(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1'
}

const app = (platform: string, name: string, version: string) => ({
  'x-tindivo-platform': platform,
  'x-tindivo-app': name,
  'x-tindivo-app-version': version,
})

describe('GET /config', () => {
  it('responde sin sesión ni cabeceras, con los mínimos de app_settings', async () => {
    const res = await getConfig(new Request('http://localhost:3001/api/v1/config'))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.minAppVersion).toEqual(MINIMOS.minAppVersion)
    expect(data.minOs).toEqual({ android: 26, ios: 17 })
    expect(data.apiVersion).toBe('v1')
    expect(typeof data.serverTime).toBe('string')
  })
})

describe('versión mínima en el proxy', () => {
  it('una app por debajo de su mínimo recibe 426 estable (RFC 9457)', async () => {
    const res = await proxy(pedir('/api/v1/customer/orders', app('ios', 'customer', '1.1.9')))
    expect(res.status).toBe(426)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(res.headers.get('x-tindivo-min-version')).toBe('1.2.0')
    const body = await res.json()
    expect(body).toMatchObject({ status: 426, code: 'client_upgrade_required' })
  })

  it('los mínimos son independientes por app y por plataforma', async () => {
    const ruta = '/api/v1/customer/orders'
    expect(pasa(await proxy(pedir(ruta, app('android', 'customer', '1.0.5'))))).toBe(true)
    expect((await proxy(pedir(ruta, app('android', 'customer', '1.0.4')))).status).toBe(426)
    expect((await proxy(pedir(ruta, app('android', 'negocios', '1.9.9')))).status).toBe(426)
    expect(pasa(await proxy(pedir(ruta, app('ios', 'negocios', '0.0.1'))))).toBe(true)
  })

  it('los clientes web sin cabeceras siguen pasando', async () => {
    expect(pasa(await proxy(pedir('/api/v1/customer/orders')))).toBe(true)
    expect(
      pasa(await proxy(pedir('/api/v1/customer/orders', app('web', 'customer', '0.0.1')))),
    ).toBe(true)
  })

  it('/config y /health siguen abiertos para una app obsoleta', async () => {
    const vieja = app('ios', 'customer', '0.0.1')
    expect(pasa(await proxy(pedir('/api/v1/config', vieja)))).toBe(true)
    expect(pasa(await proxy(pedir('/api/v1/health', vieja)))).toBe(true)
  })

  it('el mínimo sale de app_settings: subirlo bloquea, sin tocar código', async () => {
    const vieja = app('android', 'motorizados', '3.0.0')
    expect(pasa(await proxy(pedir('/api/v1/driver/x', vieja)))).toBe(true)
    await db
      .from('app_settings')
      .update({
        value: {
          ...MINIMOS,
          minAppVersion: {
            ...MINIMOS.minAppVersion,
            motorizados: { ios: '0.0.0', android: '3.1.0' },
          },
        },
      })
      .eq('key', 'client_compat')
    resetClientCompatCache()
    expect((await proxy(pedir('/api/v1/driver/x', vieja))).status).toBe(426)
  })
})

describe('GET /config · features (interruptores, 0265)', () => {
  const FEATURES = {
    features: {
      pago_yape: { enabled: false, message: 'Pago con Yape en mantenimiento' },
      mapa_vivo: { enabled: true },
    },
  }
  let original: unknown
  let existia = false

  beforeAll(async () => {
    const { data } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'client_features')
      .maybeSingle()
    existia = data !== null
    original = data?.value
  })

  afterAll(async () => {
    if (existia) {
      await db
        .from('app_settings')
        .upsert({ key: 'client_features', value: original as never }, { onConflict: 'key' })
    } else {
      await db.from('app_settings').delete().eq('key', 'client_features')
    }
  })

  const pedirConfig = () => getConfig(new Request('http://localhost:3001/api/v1/config'))

  it('la migración siembra la fila con features vacío', () => {
    expect(existia).toBe(true)
    expect(original).toEqual({ features: {} })
  })

  it('fila ausente: 200 con features {} (API desplegada antes del db push)', async () => {
    await db.from('app_settings').delete().eq('key', 'client_features')
    const res = await pedirConfig()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.features).toEqual({})
    expect(data.minOs).toEqual({ android: 26, ios: 17 })
  })

  it('fila válida: devuelve los interruptores tal cual', async () => {
    await db
      .from('app_settings')
      .upsert({ key: 'client_features', value: FEATURES }, { onConflict: 'key' })
    const res = await pedirConfig()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.features).toEqual(FEATURES.features)
  })

  it('fila inválida: 500, nunca reactiva en silencio lo apagado', async () => {
    await db
      .from('app_settings')
      .upsert(
        { key: 'client_features', value: { features: { 'Mala-Clave': { enabled: true } } } },
        { onConflict: 'key' },
      )
    const res = await pedirConfig()
    expect(res.status).toBe(500)
  })
})
