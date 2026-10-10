/**
 * ¿La respuesta REAL de una ruta es la que promete el OpenAPI?
 *
 * El documento de `@tindivo/contracts/openapi` es de lo que saldrán los
 * modelos de las apps de Swift y Kotlin. Un modelo generado decodifica con
 * rigor: un campo que el documento declara obligatorio y llega `null`, o un
 * número que llega como cadena, es una app instalada que se cae al abrir una
 * pantalla, y esa app no se puede recompilar. Por eso cada esquema se mide
 * contra lo que la ruta devuelve de verdad, contra una base real.
 *
 * Dos comprobaciones, porque fallan por motivos distintos:
 *
 *  1. **Zod** (`safeParse` del esquema con su envoltura): falta un campo, sobra
 *     un `null`, cambia un tipo. Es lo que rompe un cliente.
 *  2. **Campos sin documentar**, recorriendo el JSON Schema publicado: la ruta
 *     manda algo que el documento no dice. No rompe a nadie —el cliente lo
 *     ignora—, pero es el documento quedándose atrás en silencio, que es como
 *     empieza a mentir.
 */
import { buildOpenApiDocument, OPERATIONS } from '@tindivo/contracts/openapi'
import { z } from 'zod'

type JsonSchema = Record<string, unknown>

const DOC = buildOpenApiDocument() as {
  paths: Record<string, Record<string, { responses: Record<string, JsonSchema> }>>
}

const checked = new Set<string>()

/** Claves que la respuesta trae y el JSON Schema no declara, con su ruta (`data.items[0].foo`). */
function undocumentedKeys(value: unknown, schema: JsonSchema | undefined, at: string): string[] {
  if (!schema || value === null || value === undefined) return []
  // Uniones (`anyOf`/`oneOf`): vale si ALGUNA rama lo explica entero.
  const branches = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined
  if (branches) {
    const perBranch = branches.map((b) => undocumentedKeys(value, b, at))
    return perBranch.find((extra) => extra.length === 0) ?? perBranch[0] ?? []
  }
  if (Array.isArray(value)) {
    const items = schema.items as JsonSchema | undefined
    return value.flatMap((v, i) => undocumentedKeys(v, items, `${at}[${i}]`))
  }
  if (typeof value !== 'object') return []
  const props = schema.properties as Record<string, JsonSchema> | undefined
  // Un objeto sin `properties` (p. ej. `z.record`) admite cualquier clave.
  if (!props) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    key in props ? undocumentedKeys(v, props[key], `${at}.${key}`) : [`${at}.${key}`],
  )
}

/**
 * Falla si `body` no es lo que el registro promete para `operationId` y
 * `status`. Apunta la operación como comprobada (ver `checkedOperations`).
 */
export function expectConforms(operationId: string, status: number, body: unknown): void {
  const op = OPERATIONS.find((o) => o.operationId === operationId)
  if (!op) throw new Error(`${operationId}: no está en el registro del OpenAPI`)
  const res = op.success[status]
  if (!res) {
    throw new Error(
      `${operationId}: respondió ${status}, y el OpenAPI solo documenta ${Object.keys(op.success).join(', ')}`,
    )
  }

  if (res.envelope === 'none') {
    if (body !== null && body !== undefined && body !== '') {
      throw new Error(`${operationId} ${status}: el OpenAPI dice «sin cuerpo» y llegó uno`)
    }
  } else {
    if (!res.schema) throw new Error(`${operationId} ${status}: sin esquema de respuesta`)
    const wrapped = res.envelope === 'data' ? z.object({ data: res.schema }) : res.schema
    const parsed = wrapped.safeParse(body)
    if (!parsed.success) {
      throw new Error(
        `${operationId} ${status} no cumple su esquema:\n${z.prettifyError(parsed.error)}`,
      )
    }
    const published = DOC.paths[op.path]?.[op.method]?.responses[String(status)] as
      | { content?: Record<string, { schema?: JsonSchema }> }
      | undefined
    const extra = undocumentedKeys(body, published?.content?.['application/json']?.schema, '$')
    if (extra.length > 0) {
      throw new Error(
        `${operationId} ${status} manda campos que el OpenAPI no documenta: ${extra.join(', ')}`,
      )
    }
  }
  checked.add(operationId)
}

/** Las operaciones que ya pasaron por `expectConforms` en este fichero. */
export function checkedOperations(): ReadonlySet<string> {
  return checked
}
