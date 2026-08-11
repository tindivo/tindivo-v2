import { VehicleTypeSchema } from '@tindivo/contracts'
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
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().min(1),
  vehicleType: VehicleTypeSchema.default('moto'),
  // `''` no es "sin placa", es basura: el formulario manda cadena vacía cuando
  // el campo queda en blanco y sin esto acabaría en la columna. Se normaliza a
  // undefined para que el INSERT deje NULL, que es lo que significa.
  licensePlate: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((v) => v || undefined),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Lista de motorizados (con disponibilidad actual). */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const service = createServiceClient()
    const { data, error } = await service
      .from('drivers')
      // `driver_restaurants` viaja con la lista para que el panel pueda avisar
      // de un motorizado sin locales SIN pedir una consulta por fila. Es el
      // fallo que hay que hacer visible: sin asignación no ve ningún pedido.
      .select(
        'id,full_name,phone,vehicle_type,license_plate,is_active,driver_availability(is_available),driver_restaurants(business_id)',
      )
      .order('full_name')
    if (error) throw new Error(error.message)
    return ok(data ?? [], { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Admin crea la cuenta de un motorizado (Auth + fila drivers + disponibilidad). */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()

    const { data: created, error: authError } = await service.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      app_metadata: { primary_role: 'driver' },
      user_metadata: { full_name: body.fullName },
    })
    if (authError || !created.user)
      throw new DomainError(authError?.message ?? 'No se pudo crear el usuario', 'conflict')

    const userId = created.user.id
    // Rol asignado EXPLÍCITAMENTE (vía segura; el trigger ve app_metadata tarde).
    await service.from('users').update({ primary_role: 'driver' }).eq('id', userId)
    await service.from('user_roles').upsert({ user_id: userId, role: 'driver' })

    const { data: driver, error: driverError } = await service
      .from('drivers')
      .insert({
        user_id: userId,
        full_name: body.fullName,
        phone: body.phone,
        vehicle_type: body.vehicleType,
        license_plate: body.licensePlate,
      })
      .select('id,full_name,vehicle_type')
      .single()
    if (driverError) {
      await service.auth.admin.deleteUser(userId)
      throw new DomainError(driverError.message, 'conflict')
    }

    // Disponibilidad inicial (cerrada).
    await service.from('driver_availability').insert({ driver_id: driver.id, is_available: false })

    return ok({ userId, driver }, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
