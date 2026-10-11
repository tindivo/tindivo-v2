import { corsHeaders } from './cors'

/**
 * Cabeceras de una respuesta con datos de UNA persona: CORS más
 * `Cache-Control: private, no-store`. Ninguna caché compartida (CDN, proxy)
 * debe guardar el pedido o la dirección de un cliente para dárselo a otro.
 */
export function privateHeaders(req: Request): Record<string, string> {
  return { ...corsHeaders(req), 'cache-control': 'private, no-store' }
}
