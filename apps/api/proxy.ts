import { type NextRequest, NextResponse } from 'next/server'
import { rejectOutdatedClient } from '@/lib/http/client-compat'
import { corsHeaders, handleOptions } from '@/lib/http/cors'

/** Rutas que una app obsoleta tiene que poder llamar para enterarse de que lo es. */
const ALWAYS_OPEN = new Set(['/api/v1/config', '/api/v1/health'])

export async function proxy(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request)
  }

  if (!ALWAYS_OPEN.has(request.nextUrl.pathname)) {
    const outdated = await rejectOutdatedClient(request)
    if (outdated) return outdated
  }

  const response = NextResponse.next()
  const headers = corsHeaders(request)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: '/api/:path*',
}
