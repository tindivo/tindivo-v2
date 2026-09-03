import { AccentColorSchema, PhonePeSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const money = z.number().nonnegative().max(1000)
export const BusinessUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones')
    .min(2)
    .max(100)
    .optional(),
  tagline: z.string().max(120).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  coordinatesLat: z.number().min(-90).max(90).nullable().optional(),
  coordinatesLng: z.number().min(-180).max(180).nullable().optional(),
  estimatedEtaMin: z.number().int().nonnegative().max(300).optional(),
  estimatedEtaMax: z.number().int().nonnegative().max(300).optional(),
  phone: z.string().max(30).nullable().optional(),
  yapeNumber: z.string().max(30).nullable().optional(),
  plinNumber: z.string().max(30).nullable().optional(),
  accentColor: AccentColorSchema.optional(),
  deliveryFee: money.optional(),
  // 0125: `commission_override_near` pasó a llamarse `commission_override_delivery`
  // y `commission_override_far` se eliminó — la comisión ya no depende de la banda.
  commissionOverrideDelivery: money.nullable().optional(),
  commissionOverridePickup: money.nullable().optional(),
  isActive: z.boolean().optional(),
  // Capacidades (modo del negocio): la consistencia la garantiza el CHECK
  // `capabilities_consistent`; primary_capability se deriva por trigger.
  publishesCatalog: z.boolean().optional(),
  acceptsWebPickup: z.boolean().optional(),
  acceptsWebDelivery: z.boolean().optional(),
  usesTindivoDrivers: z.boolean().optional(),
  // Contacto PÚBLICO para pedidos por WhatsApp (modo catálogo); null lo borra.
  whatsappNumber: PhonePeSchema.nullable().optional(),
  categoria: z.array(z.string()).nullable().optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Detalle de un negocio (admin). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const service = createServiceClient()
    const { data, error } = await service
      .from('businesses')
      .select(
        'id,name,tagline,slug,address,coordinates_lat,coordinates_lng,estimated_eta_min,estimated_eta_max,phone,whatsapp_number,yape_number,plin_number,accent_color,delivery_fee,commission_override_delivery,commission_override_pickup,is_active,is_blocked,blocked_for_debt,block_reason,balance_due,primary_capability,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,categoria',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Negocio no encontrado', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Edita perfil / overrides / estado activo / capacidades (modo del negocio). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const { id } = await params
    const body = BusinessUpdateSchema.parse(await req.json())
    const patch: {
      name?: string
      slug?: string
      tagline?: string | null
      address?: string | null
      coordinates_lat?: number | null
      coordinates_lng?: number | null
      estimated_eta_min?: number
      estimated_eta_max?: number
      phone?: string | null
      yape_number?: string | null
      plin_number?: string | null
      accent_color?: string
      delivery_fee?: number
      commission_override_delivery?: number | null
      commission_override_pickup?: number | null
      is_active?: boolean
      publishes_catalog?: boolean
      accepts_web_pickup?: boolean
      accepts_web_delivery?: boolean
      uses_tindivo_drivers?: boolean
      whatsapp_number?: string | null
      categoria?: string[] | null
    } = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.slug !== undefined) patch.slug = body.slug
    if (body.tagline !== undefined) patch.tagline = body.tagline
    if (body.address !== undefined) patch.address = body.address
    if (body.coordinatesLat !== undefined) patch.coordinates_lat = body.coordinatesLat
    if (body.coordinatesLng !== undefined) patch.coordinates_lng = body.coordinatesLng
    if (body.estimatedEtaMin !== undefined) patch.estimated_eta_min = body.estimatedEtaMin
    if (body.estimatedEtaMax !== undefined) patch.estimated_eta_max = body.estimatedEtaMax
    if (body.phone !== undefined) patch.phone = body.phone
    if (body.yapeNumber !== undefined) patch.yape_number = body.yapeNumber
    if (body.plinNumber !== undefined) patch.plin_number = body.plinNumber
    if (body.accentColor !== undefined) patch.accent_color = body.accentColor
    if (body.deliveryFee !== undefined) patch.delivery_fee = body.deliveryFee
    if (body.commissionOverrideDelivery !== undefined)
      patch.commission_override_delivery = body.commissionOverrideDelivery
    if (body.commissionOverridePickup !== undefined)
      patch.commission_override_pickup = body.commissionOverridePickup
    if (body.isActive !== undefined) patch.is_active = body.isActive
    if (body.publishesCatalog !== undefined) patch.publishes_catalog = body.publishesCatalog
    if (body.acceptsWebPickup !== undefined) patch.accepts_web_pickup = body.acceptsWebPickup
    if (body.acceptsWebDelivery !== undefined) patch.accepts_web_delivery = body.acceptsWebDelivery
    if (body.usesTindivoDrivers !== undefined) patch.uses_tindivo_drivers = body.usesTindivoDrivers
    if (body.whatsappNumber !== undefined) patch.whatsapp_number = body.whatsappNumber
    if (body.categoria !== undefined) patch.categoria = body.categoria

    const service = createServiceClient()
    if (Object.keys(patch).length === 0) {
      const { data } = await service
        .from('businesses')
        .select(
          'id,name,tagline,slug,address,coordinates_lat,coordinates_lng,estimated_eta_min,estimated_eta_max,phone,whatsapp_number,yape_number,plin_number,accent_color,delivery_fee,commission_override_delivery,commission_override_pickup,is_active,is_blocked,blocked_for_debt,block_reason,balance_due,primary_capability,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,categoria',
        )
        .eq('id', id)
        .maybeSingle()
      if (!data) throw new DomainError('Negocio no encontrado', 'not_found')
      return ok(data, { headers: corsHeaders(req) })
    }
    const { data, error } = await service
      .from('businesses')
      .update(patch)
      .eq('id', id)
      .select(
        'id,name,tagline,slug,address,coordinates_lat,coordinates_lng,estimated_eta_min,estimated_eta_max,phone,whatsapp_number,yape_number,plin_number,accent_color,delivery_fee,commission_override_delivery,commission_override_pickup,is_active,is_blocked,blocked_for_debt,block_reason,balance_due,primary_capability,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,categoria',
      )
      .single()
    if (error) {
      // 23514 = violación de un CHECK (capacidades / formato de WhatsApp).
      if (error.code === '23514')
        throw new DomainError('Combinación de capacidades o formato inválido', 'validation_error')
      // 23505 = violación de clave única (ej. slug duplicado).
      if (error.code === '23505')
        throw new DomainError('El slug elegido ya está en uso por otro negocio', 'conflict')
      throw new Error(error.message)
    }
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
