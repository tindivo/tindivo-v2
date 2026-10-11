import { describe, expect, it } from 'vitest'
import {
  CLIENT_HEADERS,
  type ClientCompatSettings,
  compareVersions,
  evaluateClientVersion,
  parseClientContext,
  parseVersion,
} from '../client-compat'

const settings: ClientCompatSettings = {
  minAppVersion: {
    customer: { ios: '1.2.0', android: '1.0.5' },
    negocios: { ios: '0.0.0', android: '2.0.0' },
    motorizados: { ios: '0.0.0', android: '0.0.0' },
  },
  minOs: { android: 26, ios: 17 },
}

function headers(h: Record<string, string>): Headers {
  return new Headers(h)
}

describe('parseVersion', () => {
  it.each([
    ['1.2.3', [1, 2, 3]],
    ['1.2', [1, 2, 0]],
    ['7', [7, 0, 0]],
    ['1.2.3-beta.1', [1, 2, 3]],
    ['1.2.3+45', [1, 2, 3]],
    [' 10.0.1 ', [10, 0, 1]],
  ])('%s', (raw, expected) => {
    expect(parseVersion(raw)).toEqual(expected)
  })

  it.each(['', 'abc', '1.x', '-1.0.0', '1..2', '1.2.3.4'])('%j no es versión', (raw) => {
    expect(parseVersion(raw)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compara numéricamente, no como texto', () => {
    expect(compareVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0)
    expect(compareVersions([1, 2, 0], [1, 2, 0])).toBe(0)
    expect(compareVersions([0, 9, 9], [1, 0, 0])).toBeLessThan(0)
  })
})

describe('parseClientContext', () => {
  it('sin cabeceras de Tindivo no hay contexto (clientes web actuales)', () => {
    expect(parseClientContext(headers({}))).toBeNull()
  })

  it('lee plataforma, app, versión y build', () => {
    const ctx = parseClientContext(
      headers({
        [CLIENT_HEADERS.platform]: 'Android',
        [CLIENT_HEADERS.app]: 'customer',
        [CLIENT_HEADERS.appVersion]: '1.0.4',
        [CLIENT_HEADERS.build]: '57',
      }),
    )
    expect(ctx).toEqual({ platform: 'android', app: 'customer', version: '1.0.4', build: '57' })
  })

  it('una plataforma desconocida se ignora en vez de romper', () => {
    const ctx = parseClientContext(headers({ [CLIENT_HEADERS.platform]: 'symbian' }))
    expect(ctx?.platform).toBeNull()
  })
})

describe('evaluateClientVersion', () => {
  const ctx = (platform: string, app: string, version: string | undefined) =>
    parseClientContext(
      headers({
        [CLIENT_HEADERS.platform]: platform,
        [CLIENT_HEADERS.app]: app,
        ...(version ? { [CLIENT_HEADERS.appVersion]: version } : {}),
      }),
    )

  it('sin cabeceras no bloquea nada', () => {
    expect(evaluateClientVersion(null, settings)).toEqual({ ok: true })
  })

  it('web nunca se bloquea por versión', () => {
    expect(evaluateClientVersion(ctx('web', 'customer', '0.0.1'), settings)).toEqual({ ok: true })
  })

  it('por debajo del mínimo de su app y plataforma: obsoleta, con el mínimo', () => {
    expect(evaluateClientVersion(ctx('ios', 'customer', '1.1.9'), settings)).toEqual({
      ok: false,
      reason: 'client_outdated',
      minVersion: '1.2.0',
      platform: 'ios',
      app: 'customer',
    })
  })

  it('el mínimo es independiente por app y plataforma', () => {
    expect(evaluateClientVersion(ctx('android', 'customer', '1.1.0'), settings).ok).toBe(true)
    expect(evaluateClientVersion(ctx('android', 'negocios', '1.1.0'), settings).ok).toBe(false)
    expect(evaluateClientVersion(ctx('android', 'customer', '1.0.4'), settings).ok).toBe(false)
  })

  it('exactamente el mínimo pasa', () => {
    expect(evaluateClientVersion(ctx('android', 'customer', '1.0.5'), settings).ok).toBe(true)
  })

  it('sin versión, versión ilegible o app desconocida: no se bloquea', () => {
    expect(evaluateClientVersion(ctx('ios', 'customer', undefined), settings).ok).toBe(true)
    expect(evaluateClientVersion(ctx('ios', 'customer', 'basura'), settings).ok).toBe(true)
    expect(evaluateClientVersion(ctx('ios', 'otra', '0.0.1'), settings).ok).toBe(true)
  })
})
