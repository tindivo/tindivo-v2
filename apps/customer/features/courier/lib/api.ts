import type { CreateCourierOrderRequest } from '@tindivo/contracts'
import { api } from '@/lib/api'
import type { CourierDraft, CourierOrderResult } from '../types'

export interface Requester {
  /** Quién pide, no necesariamente quien recibe (spec: "a nombre de quién" es aparte). */
  name: string
  phone: string
}

function buildRequestBody(
  draft: CourierDraft,
  requester: Requester,
  utmSource?: string | null,
): CreateCourierOrderRequest {
  if (!draft.origin.coordinates || !draft.destination.coordinates) {
    throw new Error('Faltan las coordenadas de origen o destino')
  }
  return {
    directoryBusinessId: draft.origin.directoryBusinessId,
    // El nombre es opcional en la UI (lo que el motorizado usa es el
    // celular); el contrato y la tabla lo exigen, así que va un rótulo.
    origin: {
      contactName: draft.origin.contactName.trim() || 'Quien entrega',
      contactPhone: draft.origin.contactPhone || undefined,
      coordinates: draft.origin.coordinates,
      referenceText: draft.origin.referenceText,
    },
    destination: {
      contactName: draft.destination.contactName.trim() || 'Quien recibe',
      contactPhone: draft.destination.contactPhone || undefined,
      coordinates: draft.destination.coordinates,
      referenceText: draft.destination.referenceText,
    },
    requesterName: requester.name,
    requesterPhone: requester.phone,
    itemDescription: draft.itemDescription,
    // «Es frágil» se dice en las indicaciones; «listo ahora» lo fuerza el servidor (0235).
    isFragile: false,
    readyInMin: 0,
    payer: draft.payer,
    weightConfirmed: draft.weightConfirmed as true,
    prepaidConfirmed: draft.prepaidConfirmed as true,
    utmSource: utmSource ?? undefined,
    driverNote: draft.driverNote.trim() || undefined,
  }
}

/** Crea una solicitud de Tindivo Entregas. Cada llamada usa una Idempotency-Key nueva. */
export async function createCourierOrder(
  draft: CourierDraft,
  requester: Requester,
  utmSource?: string | null,
): Promise<CourierOrderResult> {
  const body = buildRequestBody(draft, requester, utmSource)
  const idempotencyKey = crypto.randomUUID()
  const res = await api.post<{ data: CourierOrderResult }>(
    '/customer/courier-orders',
    body,
    idempotencyKey,
  )
  return res.data
}

export async function cancelCourierOrder(id: string): Promise<void> {
  await api.post(`/customer/courier-orders/${id}/cancel`, {})
}
