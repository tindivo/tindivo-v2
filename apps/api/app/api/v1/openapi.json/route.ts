import { buildOpenApiDocument } from '@tindivo/contracts/openapi'
import { corsHeaders, handleOptions } from '@/lib/http/cors'

/**
 * El contrato de las apps del cliente, en OpenAPI 3.0.3. Sale del registro de
 * `packages/contracts/src/openapi`; el mismo documento está commiteado en
 * `packages/contracts/openapi/v1.json`, y un test comprueba que no se desvían.
 * Dinámica a propósito: las cabeceras CORS dependen del `Origin` de cada
 * petición, y construir el documento cuesta milisegundos.
 */
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export function GET(req: Request): Response {
  return Response.json(buildOpenApiDocument(), { headers: corsHeaders(req) })
}
