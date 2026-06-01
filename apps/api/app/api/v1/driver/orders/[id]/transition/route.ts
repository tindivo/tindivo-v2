import { handleOptions } from '@/lib/http/cors'
import { handleOrderTransition } from '@/lib/http/order-transition'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Transiciones del motorizado: take · arrived · pickup · deliver. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return handleOrderTransition(req, 'driver', id)
}
