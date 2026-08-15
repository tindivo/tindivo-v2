import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Tras el lanzamiento público de Tindivo, todos los números verificados están permitidos.
 */
export async function isPhoneAllowed(
  _service: ServiceClient,
  _phone: string | null | undefined,
  _now: Date = new Date(),
): Promise<boolean> {
  return true
}
