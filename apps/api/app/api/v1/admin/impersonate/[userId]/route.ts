import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * "Modo Dios": genera un magic-link de un solo uso para entrar como el usuario
 * objetivo (soporte / depuración). El admin abre el link en la app correspondiente.
 * No expone la contraseña; el enlace caduca según la config de Auth.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { userId } = await params
    const service = createServiceClient()

    const { data: target, error: getErr } = await service.auth.admin.getUserById(userId)
    if (getErr || !target?.user?.email) throw new DomainError('Usuario no encontrado', 'not_found')

    const { data: link, error: linkErr } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email: target.user.email,
    })
    if (linkErr || !link?.properties)
      throw new Error(linkErr?.message ?? 'No se pudo generar el enlace')

    return ok(
      {
        actionLink: link.properties.action_link,
        email: target.user.email,
        targetRole:
          (target.user.app_metadata as { primary_role?: string } | undefined)?.primary_role ?? null,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
