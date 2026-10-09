import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument, OPERATIONS } from '../openapi'

const here = dirname(fileURLToPath(import.meta.url))
const API_V1 = join(here, '../../../../apps/api/app/api/v1')

/** Áreas de la API que consumen las apps del cliente. Admin, negocio y motorizado van aparte. */
const CLIENT_AREAS = ['customer', 'public', 'push', 'health']

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** `customer/orders/[id]/cancel/route.ts` + `export async function POST` → `post /customer/orders/{id}/cancel` */
function declaredOperations(): string[] {
  return CLIENT_AREAS.flatMap((area) =>
    routeFiles(join(API_V1, area)).flatMap((file) => {
      const path = `/${relative(API_V1, dirname(file)).split(sep).join('/')}`.replace(
        /\[(\w+)\]/g,
        '{$1}',
      )
      const source = readFileSync(file, 'utf8')
      const methods = [
        ...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g),
      ]
      return methods.map(([, method = '']) => `${method.toLowerCase()} ${path}`)
    }),
  )
}

describe('OpenAPI de /api/v1', () => {
  it('documenta cada ruta y método del cliente que existe en apps/api (API-2)', () => {
    const registered = new Set(OPERATIONS.map((op) => `${op.method} ${op.path}`))
    const declared = declaredOperations()
    expect(declared.length).toBeGreaterThan(20)
    expect(declared.filter((op) => !registered.has(op))).toEqual([])
  })

  it('no registra rutas que ya no existen', () => {
    const declared = new Set(declaredOperations())
    expect(
      OPERATIONS.map((op) => `${op.method} ${op.path}`).filter((op) => !declared.has(op)),
    ).toEqual([])
  })

  it('cada operationId es único', () => {
    const ids = OPERATIONS.map((op) => op.operationId)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it('una operación documentada describe el cuerpo de cada respuesta de éxito', () => {
    const sinEsquema = OPERATIONS.filter((op) => op.documented).flatMap((op) =>
      Object.entries(op.success)
        .filter(([, res]) => res.envelope !== 'none' && !res.schema)
        .map(([status]) => `${op.operationId} ${status}`),
    )
    expect(sinEsquema).toEqual([])
  })

  it('el fichero commiteado es el que sale del registro (se regenera con `vitest -u`)', async () => {
    const doc = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`
    await expect(doc).toMatchFileSnapshot('../../openapi/v1.json')
  })
})
