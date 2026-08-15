import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Apertura declarada de la jornada.
 *
 * El horario semanal dice cuándo PODRÍA abrir el negocio; esto dice si hoy
 * abrió de verdad. Sin declaración, el horario es papel mojado: el negocio
 * figura cerrado aunque su horario diga que a esta hora atiende.
 *
 * Ver `Docs/spec/spec-horarios-y-apertura.md` (R7-R11) y la migración 0154.
 */

// biome-ignore lint/suspicious/noExplicitAny: el service client va sin tipar en el resto de rutas
type Client = SupabaseClient<any, any, any>

/**
 * Negocios que han declarado `open` para la jornada en curso.
 *
 * Ante un fallo de consulta devuelve `null`, que NO es lo mismo que un
 * conjunto vacío: vacío significa "nadie ha confirmado" y cierra los negocios;
 * `null` significa "no se pudo saber" y quien llama debe dejar pasar. Un
 * problema transitorio de la base no puede dejar a un negocio sin vender la
 * noche entera.
 */
export async function confirmedOpenBusinesses(
  supabase: Client,
  businessIds: string[],
  serviceDate?: string | null,
): Promise<Set<string> | null> {
  if (businessIds.length === 0) return new Set()

  let date = serviceDate
  if (date === undefined) {
    const { data: rpcDate, error: dateErr } = await supabase.rpc('current_service_date')
    if (dateErr || !rpcDate) return null
    date = rpcDate
  }
  if (!date) return null

  const { data, error } = await supabase
    .from('business_service_days')
    .select('business_id')
    .in('business_id', businessIds)
    .eq('service_date', date)
    .eq('status', 'open')

  if (error) return null
  return new Set((data ?? []).map((r: { business_id: string }) => r.business_id))
}

/** Versión de un solo negocio. `null` = no se pudo determinar (ver arriba). */
export async function hasConfirmedOpening(
  supabase: Client,
  businessId: string,
): Promise<boolean | null> {
  const set = await confirmedOpenBusinesses(supabase, [businessId])
  return set === null ? null : set.has(businessId)
}
