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
  'id,slug,name,accent_color,logo_url,banner_url,tagline,categoria,primary_capability,estimated_eta_min,estimated_eta_max,coordinates_lat,coordinates_lng,address,publishes_catalog,accepts_web_pickup,accepts_web_delivery,whatsapp_number'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const supabase = createServiceClient()

    // 1) Negocios y fecha de servicio en paralelo. La fecha no depende de los
    // negocios, así que la lanzamos al mismo tiempo. Si falla, seguimos con
    // confirmed = null (un fallo transitorio no puede cerrar el catálogo).
    const [businessesResult, serviceDateResult] = await Promise.allSettled([
      supabase
        .from('businesses')
        .select(PUBLIC_COLUMNS)
        .eq('publishes_catalog', true)
        .eq('is_active', true)
        .eq('is_blocked', false)
        .order('name'),
      supabase.rpc('current_service_date'),
    ])

    if (businessesResult.status === 'rejected') {
      throw new Error(String(businessesResult.reason))
    }
    const { data, error } = businessesResult.value
    if (error) throw new Error(error.message)

    const rows = data ?? []
    const serviceDate =
      serviceDateResult.status === 'fulfilled' ? serviceDateResult.value.data : null

    // 2) Horarios y apertura confirmada en paralelo. Ambos necesitan los IDs y
    // la fecha de servicio, pero no dependen entre sí.
    let scheduleByBiz = new Map<string, ScheduleDayRow[]>()
    let confirmed: Set<string> | null = null
    if (rows.length > 0) {
      const ids = rows.map((b) => b.id)
      const [schedulesResult, confirmedResult] = await Promise.allSettled([
        supabase
          .from('business_schedule')
          .select('business_id,day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end')
          .in('business_id', ids),
        confirmedOpenBusinesses(supabase, ids, serviceDate),
      ])

      if (schedulesResult.status === 'fulfilled') {
        scheduleByBiz = (schedulesResult.value.data ?? []).reduce(
          (acc, { business_id, ...day }) => {
            const list = acc.get(business_id) ?? []
            list.push(day)
            acc.set(business_id, list)
            return acc
          },
          scheduleByBiz,
        )
      }
      confirmed = confirmedResult.status === 'fulfilled' ? confirmedResult.value : null
    }

    // Estado abierto/cerrado para el badge del home. null = sin horario configurado
    // (se trata como siempre abierto y el cliente no muestra badge).
    const now = new Date()
    const withOpenState = rows.map((b) => {
      const schedule = scheduleByBiz.get(b.id)
      if (!schedule) return { ...b, is_open_now: null }
      // `confirmed === null` (consulta fallida) se pasa como `null` para que
      // getOpenStatus caiga en "manda solo el horario".
      const opening = confirmed === null ? null : confirmed.has(b.id)
      return { ...b, is_open_now: getOpenStatus(schedule, now, opening).kind === 'open' }
    })

    const cacheHeaders = {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45',
      Vary: 'Accept-Encoding',
    }
    return ok(withOpenState, { headers: { ...corsHeaders(req), ...cacheHeaders } })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
