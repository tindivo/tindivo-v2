import { type NextRequest, NextResponse } from 'next/server'
import { corsHeaders, handleOptions } from '@/lib/http/cors'

export function proxy(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request)
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
