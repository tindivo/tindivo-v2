/** Lee o genera el X-Request-Id para correlación de logs. */
export function getRequestId(req: Request): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID()
}
