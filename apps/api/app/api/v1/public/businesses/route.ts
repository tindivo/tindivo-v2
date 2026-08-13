import { getOpenStatus, type ScheduleDayRow } from '@tindivo/contracts'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { confirmedOpenBusinesses } from '@/lib/opening/service-day'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Solo columnas seguras (reemplaza la vista businesses_public; nunca expone
// yape_number / balance_due / comisiones / phone). whatsapp_number SÍ es
// público: es el contacto opt-in para pedidos por WhatsApp en modo catálogo.
const PUBLIC_COLUMNS =
  'id,name,accent_color,logo_url,banner_url,tagline,categoria,primary_capability,estimated_eta_min,estimated_eta_max,coordinates_lat,coordinates_lng,address,publishes_catalog,accepts_web_pickup,accepts_web_delivery,whatsapp_number'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('businesses')
      .select(PUBLIC_COLUMNS)
      .eq('publishes_catalog', true)
      .eq('is_active', true)
      .eq('is_blocked', false)
      .order('name')
    if (error) throw new Error(error.message)

    // Estado abierto/cerrado para el badge del home. null = sin horario configurado
    // (se trata como siempre abierto y el cliente no muestra badge).
    const rows = data ?? []
    let scheduleByBiz = new Map<string, ScheduleDayRow[]>()
    if (rows.length > 0) {
      const { data: schedules } = await supabase
        .from('business_schedule')
        .select('business_id,day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end')
        .in(
          'business_id',
          rows.map((b) => b.id),
        )
      scheduleByBiz = (schedules ?? []).reduce((acc, { business_id, ...day }) => {
        const list = acc.get(business_id) ?? []
        list.push(day)
        acc.set(business_id, list)
        return acc
      }, scheduleByBiz)
    }
    // Apertura declarada de hoy. El horario dice cuándo PODRÍA abrir; esto, si
    // abrió. `null` = no se pudo consultar, y entonces manda solo el horario:
    // un fallo transitorio no puede cerrar el catálogo entero.
    const confirmed = await confirmedOpenBusinesses(
      supabase,
      rows.map((b) => b.id),
    )

    const now = new Date()
    const withOpenState = rows.map((b) => {
      const schedule = scheduleByBiz.get(b.id)
      if (!schedule) return { ...b, is_open_now: null }
      // `confirmed === null` (consulta fallida) se pasa como `null` para que
      // getOpenStatus caiga en "manda solo el horario".
      const opening = confirmed === null ? null : confirmed.has(b.id)
      return { ...b, is_open_now: getOpenStatus(schedule, now, opening).kind === 'open' }
    })
    return ok(withOpenState, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
