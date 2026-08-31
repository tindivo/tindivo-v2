import { z } from 'zod'
import { requireUser } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const SubSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
  userAgent: z.string().max(400).optional(),
  /**
   * UUID por instalación de PWA, generado y guardado por el cliente. Es la
   * identidad REAL del dispositivo; `userAgent` no lo es (ver el paso 2).
   * Opcional porque un cliente sin actualizar no lo manda todavía.
   */
  installId: z.string().min(8).max(64).optional(),
})

/**
 * Dar de baja acepta dos formas, y son excluyentes a propósito:
 *
 *   { endpoint }   → este dispositivo. Es el caso de cerrar sesión aquí.
 *   { all: true }  → TODOS los dispositivos del usuario.
 *
 * `all` existe para acompañar a `signOutEverywhere`. Revocar las sesiones sin
 * borrar las suscripciones dejaría al dispositivo perdido sin poder abrir nada
 * pero AÚN recibiendo notificaciones, que llevan nombre y dirección del cliente
 * en la vista previa: el acceso se corta y la fuga de datos sigue.
 */
const UnsubSchema = z.union([
  z.object({ endpoint: z.string().url().max(1000) }),
  z.object({ all: z.literal(true) }),
])

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Registra (o reactiva) la suscripción push del dispositivo del usuario. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireUser(req)
    const body = SubSchema.parse(await req.json())
    const service = createServiceClient()

    // 1) Endpoint reclamado por OTRO usuario.
    // Caso: motorizado B inicia sesion en el device de A sin que
    // A haya cerrado sesion limpiamente. Sin este delete, B queda
    // sin suscripcion propia y A sigue recibiendo los push de B.
    // Requiere service_role: con el JWT del usuario, RLS hace que
    // el delete sea no-op silencioso sobre filas ajenas.
    const { error: e1 } = await service
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint)
      .neq('user_id', user.id)
    if (e1) console.error('[push:subscribe] cleanup-foreign failed', e1.message)

    // 2) Zombies del MISMO usuario en el MISMO DISPOSITIVO.
    // Mismo install_id + endpoint distinto = endpoint rotado.
    // Conservamos el actual (se upserta abajo), borramos el resto.
    //
    // LA CLAVE ES `install_id` Y NO `user_agent`, Y ESO NO ES UN DETALLE.
    //
    // Con `user_agent` esto borraba de más. Desde la *UA reduction* de Chrome,
    // el UA de Android está congelado en `Android 10; K` y es idéntico byte a
    // byte entre teléfonos distintos: en `tindivo-prod` hay nueve dispositivos
    // de nueve usuarios compartiendo la misma cadena exacta. Entre usuarios no
    // había daño (el borrado va acotado con `user_id`), pero DENTRO de un
    // usuario dos Android se borraban la suscripción mutuamente — el último en
    // abrir la app dejaba al otro sin avisos, en silencio, y el otro no se
    // enteraba hasta que un pedido no le sonaba. Justo el fallo que este
    // endpoint existe para evitar.
    //
    // SIN `installId` NO SE BORRA NADA, y tampoco se cae de vuelta al
    // `user_agent`. El fallback parece prudente y es lo contrario: dejaría el
    // fallo vivo para los clientes viejos, y además de forma ASIMÉTRICA — un
    // Android sin actualizar borraría al que sí manda `installId`, pero no al
    // revés. Lo que se pierde es una fila rancia cuando un cliente viejo rota
    // su endpoint; eso lo recoge la purga por 404/410 de `send-push` en el
    // siguiente envío, y no le apaga los avisos a nadie mientras tanto.
    if (body.installId) {
      const { error: e2 } = await service
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('install_id', body.installId)
        .neq('endpoint', body.endpoint)
      if (e2) console.error('[push:subscribe] cleanup-zombies failed', e2.message)
    }

    // 3) Upsert. onConflict se mantiene en 'user_id,endpoint'
    // porque esa es la constraint real de la tabla en v2.
    const { error } = await service.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        // `user_agent` sigue guardándose, pero YA NO ES UNA CLAVE: vale como
        // etiqueta legible para una persona que mire la tabla ("iPhone 18.1.1",
        // "Android"), no para decidir qué fila borrar.
        user_agent: body.userAgent ?? null,
        install_id: body.installId ?? null,
        failure_count: 0,
        last_failed_at: null,
      },
      { onConflict: 'user_id,endpoint' },
    )
    if (error) throw new Error(error.message)

    console.log('[push:subscribe] ok', {
      userId: user.id,
      endpointHead: body.endpoint.slice(0, 40),
    })

    return ok({ subscribed: true }, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Da de baja la suscripción de este dispositivo, o la de todos (`{ all: true }`). */
export async function DELETE(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireUser(req)
    const body = UnsubSchema.parse(await req.json())
    const service = createServiceClient()

    // El filtro por `user_id` va SIEMPRE, también en la rama `all`: sin él,
    // `all` borraría las suscripciones de todo el mundo.
    const base = service.from('push_subscriptions').delete().eq('user_id', user.id)
    const { error } = 'all' in body ? await base : await base.eq('endpoint', body.endpoint)

    if (error) throw new Error(error.message)

    console.log('[push:unsubscribe] ok', {
      userId: user.id,
      alcance: 'all' in body ? 'todos' : body.endpoint.slice(0, 40),
    })

    return ok({ unsubscribed: true }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
