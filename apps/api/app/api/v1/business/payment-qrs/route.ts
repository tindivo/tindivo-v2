import { MAX_PAYMENT_QRS, PaymentQrInputSchema, PaymentQrSlotSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { PAYMENT_QR_COLUMNS, toPaymentQrViews } from '@/lib/mappers/payment-qr'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Los métodos de cobro del negocio: hasta `MAX_PAYMENT_QRS`, y cuál se enseña
 * primero (0184).
 *
 * Todo pasa por `service_role` filtrando por `user_id`, igual que el resto de
 * `/business/*`: el negocio nunca escribe la tabla desde el navegador aunque su
 * policy `bpq_owner_all` se lo permitiría.
 */

const DefaultSlotSchema = z.object({ defaultSlot: PaymentQrSlotSchema })

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Resuelve el negocio del usuario autenticado. */
async function requireOwnBusiness(userId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('businesses')
    .select('id,default_payment_qr_slot')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DomainError('Negocio no encontrado', 'not_found')
  return { service, biz: data }
}

async function listPayload(
  service: ReturnType<typeof createServiceClient>,
  businessId: string,
  defaultSlot: number,
) {
  const { data, error } = await service
    .from('business_payment_qrs')
    .select(PAYMENT_QR_COLUMNS)
    .eq('business_id', businessId)
  if (error) throw new Error(error.message)
  return { defaultSlot, maxSlots: MAX_PAYMENT_QRS, items: toPaymentQrViews(data, defaultSlot) }
}

/** Los métodos de cobro del negocio, principal primero. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { service, biz } = await requireOwnBusiness(user.id)
    return ok(await listPayload(service, biz.id, biz.default_payment_qr_slot), {
      headers: corsHeaders(req),
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Alta o edición de UN método de cobro, identificado por su slot. */
export async function PUT(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const body = PaymentQrInputSchema.parse(await req.json())
    const { service, biz } = await requireOwnBusiness(user.id)
    const { error } = await service.from('business_payment_qrs').upsert(
      {
        business_id: biz.id,
        slot: body.slot,
        wallet: body.wallet,
        account_number: body.accountNumber,
        account_name: body.accountName,
        qr_url: body.qrUrl ?? null,
      },
      { onConflict: 'business_id,slot' },
    )
    if (error) {
      // 23514 = los CHECK de la 0184 (slot fuera de rango, número o titular con
      // forma inválida). Es error del que llama, no del servidor.
      if (error.code === '23514')
        throw new DomainError('Datos de cobro inválidos', 'validation_error')
      throw new Error(error.message)
    }
    return ok(await listPayload(service, biz.id, biz.default_payment_qr_slot), {
      headers: corsHeaders(req),
    })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Cambia cuál es el método principal. */
export async function PATCH(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const { defaultSlot } = DefaultSlotSchema.parse(await req.json())
    const { service, biz } = await requireOwnBusiness(user.id)

    // Marcar como principal un slot vacío dejaría al motorizado enseñando lo
    // que el negocio NO eligió. Es un error del que llama y se dice claro.
    const { data: target, error: targetErr } = await service
      .from('business_payment_qrs')
      .select('slot')
      .eq('business_id', biz.id)
      .eq('slot', defaultSlot)
      .maybeSingle()
    if (targetErr) throw new Error(targetErr.message)
    if (!target) throw new DomainError('Ese método de cobro no existe todavía', 'validation_error')

    const { error } = await service
      .from('businesses')
      .update({ default_payment_qr_slot: defaultSlot, updated_at: new Date().toISOString() })
      .eq('id', biz.id)
    if (error) throw new Error(error.message)
    return ok(await listPayload(service, biz.id, defaultSlot), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Borra un método de cobro. */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const raw = new URL(req.url).searchParams.get('slot')
    const slot = PaymentQrSlotSchema.parse(Number(raw))
    const { service, biz } = await requireOwnBusiness(user.id)

    const { error } = await service
      .from('business_payment_qrs')
      .delete()
      .eq('business_id', biz.id)
      .eq('slot', slot)
    if (error) throw new Error(error.message)

    // Si el que se fue era el principal, el puntero se queda apuntando a un
    // hueco. La lectura ya cae al que quede (ver `toPaymentQrViews`), pero
    // dejarlo colgando haría que reaparezca como principal si el negocio vuelve
    // a llenar ese slot con otra cuenta. Se repunta al que sobrevive.
    let defaultSlot = biz.default_payment_qr_slot
    if (defaultSlot === slot) {
      const { data: rest } = await service
        .from('business_payment_qrs')
        .select('slot')
        .eq('business_id', biz.id)
        .order('slot')
        .limit(1)
      defaultSlot = rest?.[0]?.slot ?? 1
      await service
        .from('businesses')
        .update({ default_payment_qr_slot: defaultSlot, updated_at: new Date().toISOString() })
        .eq('id', biz.id)
    }
    return ok(await listPayload(service, biz.id, defaultSlot), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
