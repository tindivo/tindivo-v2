import { DomainError, type PerformancePayload } from '@tindivo/core'
import { createServiceClient } from '@/lib/supabase/service'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface PerformanceRequest {
  start: string
  end: string
  label: string
}

/**
 * Lee y valida `?start=&end=&label=` — el mismo contrato para el JSON del panel
 * y para el PDF, así los dos no pueden divergir en qué rango entienden.
 */
export function parsePerformanceRange(url: URL): PerformanceRequest {
  const start = url.searchParams.get('start') ?? ''
  const end = url.searchParams.get('end') ?? ''
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new DomainError('Parámetros start/end inválidos (YYYY-MM-DD)', 'validation_error')
  }
  if (end < start) {
    throw new DomainError('El fin del rango es anterior al inicio', 'validation_error')
  }
  return { start, end, label: url.searchParams.get('label') ?? `${start} al ${end}` }
}

export interface BusinessRef {
  id: string
  name: string
}

/** El negocio del usuario autenticado. Nadie pide métricas de otro local. */
export async function requireOwnBusiness(userId: string): Promise<BusinessRef> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('businesses')
    .select('id, name')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DomainError('Negocio no encontrado', 'not_found')
  return { id: data.id, name: data.name }
}

/**
 * Todas las cifras del panel «Rendimiento» en una llamada. El cálculo vive en
 * la 0210 y no aquí porque necesita el historial completo del negocio
 * (nuevos vs. recurrentes) y la tabla que factura de verdad
 * (`business_charges`), no una derivación desde `orders`.
 */
export async function fetchPerformance(
  businessId: string,
  start: string,
  end: string,
): Promise<PerformancePayload> {
  const service = createServiceClient()
  // biome-ignore lint/suspicious/noExplicitAny: RPC añadido en la migración 0210
  const { data, error } = await (service as any).rpc('business_performance_metrics', {
    p_business_id: businessId,
    p_start: start,
    p_end: end,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new DomainError('No se pudieron calcular las métricas', 'internal_error')
  return data as PerformancePayload
}
