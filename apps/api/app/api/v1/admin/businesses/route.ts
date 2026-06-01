import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
  phone: z.string().optional(),
  publishesCatalog: z.boolean().default(true),
  acceptsWebPickup: z.boolean().default(false),
  acceptsWebDelivery: z.boolean().default(true),
  usesTindivoDrivers: z.boolean().default(true),
  accentColor: z
    .string()
    .regex(/^[0-9a-f]{6}$/)
    .optional(),
  yapeNumber: z.string().optional(),
  tagline: z.string().max(120).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Lista de negocios (gestión admin). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('businesses')
      .select('id,name,primary_capability,is_active,is_blocked,balance_due,created_at')
      .order('name')
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Admin crea la cuenta de un negocio (Auth + fila businesses). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()

    // El rol seguro va en app_metadata (no editable por el usuario); el trigger
    // handle_new_user crea public.users + user_roles('business').
    const { data: created, error: authError } = await service.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      app_metadata: { primary_role: 'business' },
      user_metadata: { full_name: body.name },
    })
    if (authError || !created.user)
      throw new DomainError(authError?.message ?? 'No se pudo crear el usuario', 'conflict')

    const userId = created.user.id
    // Rol asignado EXPLÍCITAMENTE (Supabase setea app_metadata tras el INSERT,
    // así que el trigger no lo ve; vía segura recomendada por el review).
    await service.from('users').update({ primary_role: 'business' }).eq('id', userId)
    await service.from('user_roles').upsert({ user_id: userId, role: 'business' })

    const { data: business, error: bizError } = await service
      .from('businesses')
      .insert({
        user_id: userId,
        name: body.name,
        phone: body.phone,
        publishes_catalog: body.publishesCatalog,
        accepts_web_pickup: body.acceptsWebPickup,
        accepts_web_delivery: body.acceptsWebDelivery,
        uses_tindivo_drivers: body.usesTindivoDrivers,
        accent_color: body.accentColor ?? 'f97316',
        yape_number: body.yapeNumber,
        tagline: body.tagline,
      })
      .select('id,name,primary_capability,accent_color')
      .single()
    if (bizError) {
      // Evitar usuario huérfano si falla la fila del negocio.
      await service.auth.admin.deleteUser(userId)
      throw new DomainError(bizError.message, 'conflict')
    }

    return ok({ userId, business }, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
