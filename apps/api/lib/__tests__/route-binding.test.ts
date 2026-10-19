/**
 * Test de enlace de rutas (ADR 0039, TS-17): cada archivo de `app/**\/route.ts` que usa
 * `toNextRoute` exporta, para cada método, un handler cuyo `spec` declara ese método y la ruta
 * que reproduce la carpeta. Así una carpeta movida o un método cambiado no deja un handler
 * montado donde su contrato no dice.
 *
 * Hoy ninguna ruta usa `toNextRoute`: los casos sintéticos prueban la función que compara, para
 * que el recorrido real no pase en vacío cuando lleguen las primeras.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app')
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** `api/v1/customer/orders/[orderId]/cancel/route.ts` → `/api/v1/customer/orders/{orderId}/cancel`. */
export function pathFromRouteFile(relativeFile: string): string {
  const segments = relativeFile
    .replaceAll('\\', '/')
    .replace(/\/?route\.ts$/, '')
    .split('/')
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[(.+)\]$/, '{$1}'))
  return `/${segments.join('/')}`
}

/** Compara lo exportado por un archivo de ruta con la carpeta donde vive. Devuelve los fallos. */
export function checkRouteBinding(
  relativeFile: string,
  exportsOfModule: Record<string, unknown>,
): string[] {
  const expectedPath = pathFromRouteFile(relativeFile)
  const failures: string[] = []
  let bound = 0
  for (const method of HTTP_METHODS) {
    if (!(method in exportsOfModule)) continue
    const spec = specOf(exportsOfModule[method])
    if (!spec) {
      failures.push(`${relativeFile}: ${method} no está enlazado con toNextRoute`)
      continue
    }
    bound++
    if (spec.method !== method) {
      failures.push(`${relativeFile}: exporta ${method} pero el handler declara ${spec.method}`)
    }
    if (spec.path !== expectedPath) {
      failures.push(
        `${relativeFile}: la carpeta es ${expectedPath} pero el handler declara ${spec.path}`,
      )
    }
  }
  if (bound === 0) failures.push(`${relativeFile}: no exporta ningún método enlazado`)
  return failures
}

function specOf(value: unknown): { method: string; path: string } | null {
  if (typeof value !== 'function' || !('handler' in value)) return null
  const handler = value.handler
  if (typeof handler !== 'function' || !('spec' in handler)) return null
  const spec = handler.spec
  if (typeof spec !== 'object' || spec === null) return null
  if (!('method' in spec) || !('path' in spec)) return null
  if (typeof spec.method !== 'string' || typeof spec.path !== 'string') return null
  return { method: spec.method, path: spec.path }
}

function routeFiles(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => f === 'route.ts' || f.endsWith('/route.ts'))
}

function fakeRoute(method: string, path: string): unknown {
  const handler = Object.assign(async () => new Response(null), { spec: { method, path } })
  return Object.assign(async () => new Response(null), { handler })
}

describe('enlace de rutas: la función que compara', () => {
  it('convierte la carpeta en la ruta del contrato', () => {
    expect(pathFromRouteFile('api/v1/customer/orders/[orderId]/cancel/route.ts')).toBe(
      '/api/v1/customer/orders/{orderId}/cancel',
    )
    expect(pathFromRouteFile('api\\v1\\health\\route.ts')).toBe('/api/v1/health')
  })

  it('acepta método y ruta que coinciden', () => {
    const file = 'api/v1/customer/orders/[orderId]/cancel/route.ts'
    const failures = checkRouteBinding(file, {
      POST: fakeRoute('POST', '/api/v1/customer/orders/{orderId}/cancel'),
      dynamic: 'force-dynamic',
    })
    expect(failures).toEqual([])
  })

  it('rechaza un método distinto del que declara el handler', () => {
    const failures = checkRouteBinding('api/v1/x/route.ts', {
      GET: fakeRoute('POST', '/api/v1/x'),
    })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('exporta GET pero el handler declara POST')
  })

  it('rechaza una ruta distinta de la carpeta', () => {
    const failures = checkRouteBinding('api/v1/x/[id]/route.ts', {
      GET: fakeRoute('GET', '/api/v1/x/{orderId}'),
    })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('la carpeta es /api/v1/x/{id}')
  })

  it('rechaza un método exportado sin toNextRoute', () => {
    const failures = checkRouteBinding('api/v1/x/route.ts', { GET: async () => new Response(null) })
    expect(failures[0]).toContain('no está enlazado con toNextRoute')
  })
})

describe('enlace de rutas: app/**/route.ts reales', () => {
  it('cada ruta que usa toNextRoute coincide con su carpeta', async () => {
    const files = routeFiles()
    expect(files.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const file of files) {
      const source = readFileSync(join(APP_DIR, file), 'utf8')
      if (!source.includes('toNextRoute')) continue
      const loaded: Record<string, unknown> = await import(pathToFileURL(join(APP_DIR, file)).href)
      failures.push(...checkRouteBinding(file, loaded))
    }
    expect(failures).toEqual([])
  })
})
