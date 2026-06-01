import { handleOptions } from '@/lib/http/cors'
import { handleOrderTransition } from '@/lib/http/order-transition'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Transiciones del negocio: accept · preparing · ready · cancel. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return handleOrderTransition(req, 'business', id)
}
