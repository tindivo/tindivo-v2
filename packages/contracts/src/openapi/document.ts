import { z } from 'zod'
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  ERROR_CODE_STATUS,
  ProblemDetailsSchema,
} from '../errors'
import { OPERATIONS, type OperationSpec, type SuccessResponse } from './registry'
import { openEnum } from './schema-helpers'

/**
 * Construye el OpenAPI de `/api/v1` a partir de `OPERATIONS`.
 *
 * OpenAPI **3.0.3** y no 3.1: es la versión que mejor soportan hoy los
 * generadores de clientes de Swift y Kotlin, y Zod 4 la emite directamente
 * (`target: 'openapi-3.0'`). Las respuestas se convierten con `io: 'output'` y
 * las peticiones con `io: 'input'`: un `.default()` hace opcional el campo al
 * pedir y obligatorio al responder.
 */

type JsonSchema = Record<string, unknown>

/**
 * Zod pone `minimum/maximum` de ±2^53 a todo `.int()`. No dicen nada (JSON no
 * tiene enteros más grandes que sean seguros) y los generadores los convierten
 * en validaciones inútiles: se quitan.
 */
function stripSafeIntegerBounds(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) stripSafeIntegerBounds(child)
    return
  }
  if (node === null || typeof node !== 'object') return
  const obj = node as JsonSchema
  if (obj.minimum === Number.MIN_SAFE_INTEGER) delete obj.minimum
  if (obj.maximum === Number.MAX_SAFE_INTEGER) delete obj.maximum
  for (const child of Object.values(obj)) stripSafeIntegerBounds(child)
}

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as JsonSchema
  stripSafeIntegerBounds(json)
  return json
}

/**
 * Para el cliente, `code` es un enum ABIERTO: el plan añade códigos de razón
 * estables sin retirar los vigentes, y una app instalada no debe romperse al
 * recibir uno nuevo.
 */
const ProblemForClientsSchema = ProblemDetailsSchema.extend({
  type: z.string(),
  code: openEnum(API_ERROR_CODES),
})

function successContent(res: SuccessResponse): JsonSchema | undefined {
  if (res.envelope === 'none') return undefined
  if (!res.schema) {
    return { 'application/json': { schema: { description: res.description } } }
  }
  const body = res.envelope === 'data' ? z.object({ data: res.schema }) : res.schema
  return { 'application/json': { schema: toSchema(body, 'output') } }
}

function errorResponses(op: OperationSpec): Record<string, JsonSchema> {
  const codes: ApiErrorCode[] = [...(op.errors ?? []), 'internal_error']
  const byStatus = new Map<number, ApiErrorCode[]>()
  for (const code of codes) {
    const status = ERROR_CODE_STATUS[code]
    byStatus.set(status, [...(byStatus.get(status) ?? []), code])
  }
  const out: Record<string, JsonSchema> = {}
  for (const [status, list] of [...byStatus].sort(([a], [b]) => a - b)) {
    out[String(status)] = {
      description: `Problem Details (RFC 9457). \`code\`: ${list.join(', ')}`,
      content: {
        'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
      },
    }
  }
  return out
}

function parameters(op: OperationSpec): JsonSchema[] {
  const params: JsonSchema[] = []
  for (const [name, schema] of Object.entries(op.pathParams ?? {})) {
    params.push({ name, in: 'path', required: true, schema: toSchema(schema, 'input') })
  }
  if (op.query) {
    const shape = op.query.shape as Record<string, z.ZodType>
    for (const [name, schema] of Object.entries(shape)) {
      params.push({
        name,
        in: 'query',
        required: !schema.safeParse(undefined).success,
        schema: toSchema(schema, 'input'),
      })
    }
  }
  if (op.idempotent) {
    params.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      description: 'Repetir la misma clave devuelve el resultado ya creado, sin duplicarlo',
      schema: { type: 'string' },
    })
  }
  return params
}

function operation(op: OperationSpec): JsonSchema {
  const responses: Record<string, JsonSchema> = {}
  for (const [status, res] of Object.entries(op.success)) {
    const content = successContent(res)
    responses[status] = content
      ? { description: res.description, content }
      : { description: res.description }
  }
  Object.assign(responses, errorResponses(op))

  const out: JsonSchema = {
    operationId: op.operationId,
    summary: op.summary,
    tags: op.tags,
    responses,
  }
  if (op.description) out.description = op.description
  const params = parameters(op)
  if (params.length) out.parameters = params
  if (op.body) {
    out.requestBody = {
      required: true,
      content: { 'application/json': { schema: toSchema(op.body, 'input') } },
    }
  }
  out.security = op.auth === 'none' ? [] : [{ bearerAuth: [] }]
  if (op.auth === 'customer') out['x-tindivo-role'] = 'customer'
  if (!op.documented) out['x-tindivo-pending'] = true
  return out
}

export function buildOpenApiDocument(operations: OperationSpec[] = OPERATIONS): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {}
  for (const op of operations) {
    let byMethod = paths[op.path]
    if (!byMethod) {
      byMethod = {}
      paths[op.path] = byMethod
    }
    byMethod[op.method] = operation(op)
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Tindivo API',
      version: 'v1',
      description:
        'Contrato REST de las apps del cliente. Las rutas heredadas se documentan como son hoy (algunas sin la ' +
        'envoltura `{ data }`). Las operaciones con `x-tindivo-pending` aún no tienen la respuesta descrita: no ' +
        'generes código contra ellas. Los campos con `x-known-values` son enums abiertos: un valor nuevo no debe ' +
        'romper el cliente.',
    },
    servers: [{ url: 'https://apiv2.tindivo.com/api/v1', description: 'Producción' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token de Supabase Auth',
        },
      },
      schemas: { ProblemDetails: toSchema(ProblemForClientsSchema, 'output') },
    },
    paths,
  }
}
