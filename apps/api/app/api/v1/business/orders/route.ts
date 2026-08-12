import { BLACKLISTED_PHONES, DeliveryMethodSchema, PaymentIntentSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Pedido manual = SOLO monto total (sin selección de platos). Nombre y teléfono
// son opcionales; un único campo de dirección/referencia (máx 500).
const Schema = z.object({
  deliveryMethod: DeliveryMethodSchema,
  paymentIntent: PaymentIntentSchema,
  // AQUÍ vive la obligatoriedad de la banda, no en el esquema de la DB.
  //
  // El RPC conserva `p_delivery_distance_band DEFAULT NULL` para que la firma
  // aguante llamadas viejas sin reventar; una llamada sin banda queda marcada
  // como `delivery_fee_source = 'system'`. Pero por ESTE endpoint no puede
  // entrar un pedido sin banda: sin `.optional()`, zod lo rechaza con 422.
  //
  // Es deliberado y sigue el precedente del modal del motorizado en el v1
  // (`confirm-pickup-modal.tsx`), que tampoco tenía valor por defecto: obligar
  // a elegir en vez de caer a `near` en silencio. Un default aquí devolvería el
  // problema que esta migración vino a resolver, pero con dos botones en
  // pantalla dando falsa sensación de control.
  deliveryDistanceBand: z.enum(['near', 'far']),
  // OBLIGATORIO. Es cómo el motorizado identifica el pedido —lo más grande de
  // su tarjeta, lo que busca en la lista, lo que dice al llamar—, y era
  // opcional (`create_business_manual_order`, 0032) en el único canal que crea
  // pedidos en el piloto. Se exige en el borde, no en la columna: hay filas
  // viejas con NULL y un `not null` en la tabla necesitaría rellenarlas.
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z
    .string()
    .trim()
    .max(20)
    .refine((val) => !val || !BLACKLISTED_PHONES.includes(val.replace(/\D/g, '') as any), {
      message: 'Número de teléfono de prueba no permitido',
    })
    .optional(),
  deliveryReference: z.string().trim().max(500).optional(),
  // `notes` se retiró en la migración 0127 junto con `p_notes`: era un campo que
  // el RPC aceptaba desde la 0080 y descartaba en silencio. Ningún cliente lo
  // enviaba. Una nota dirigida al MOTORIZADO es una idea aparte, sin diseñar.
  prepTimeMinutes: z.number().int().min(1).max(120).default(20),
  // 0129 · Es el TOTAL que la cajera le cobra al cliente, envío INCLUIDO. La
  // comida la deduce el RPC restando el envío de la banda.
  //
  // El campo se llamaba `orderAmount` y significaba solo comida, mientras la
  // pantalla lo rotulaba "Total del pedido": la cajera escribía 27 (25 + 2 de
  // envío) y el pedido salía a 29. El RENOMBRE ES PARTE DEL ARREGLO — un
  // frontend viejo que mande `orderAmount` se lleva un 422 aquí en vez de colar
  // un total por comida. Por eso NO hay alias de compatibilidad: mantener los
  // dos nombres vivos sería mantener viva la ambigüedad.
  //
  // Que el total cubra el envío NO se valida aquí: el envío depende de la banda
  // y de una cadena de fallback que solo el RPC resuelve. Allá se rechaza con un
  // mensaje que dice los dos números.
  totalAmount: z.number().positive().max(99_999_999.99),
  clientPaysWith: z.number().nonnegative().max(99_999_999.99).optional(),
  yapeAmount: z.number().nonnegative().max(99_999_999.99).optional(),
  cashAmount: z.number().nonnegative().max(99_999_999.99).optional(),
  // 0145 · La fila del directorio que la cajera eligió en el popup. Opcional: es
  // NULL para el cliente nuevo, para "escribir dirección nueva", y cuando la
  // cajera editó el texto y se desvinculó.
  //
  // NO se confía en él como permiso de nada: el RPC comprueba que la fila exista
  // Y que sea del MISMO teléfono antes de copiarle las coordenadas. Un id de
  // otro cliente se ignora en vez de mandar al motorizado al GPS de otra casa.
  addressDirectoryId: z.string().uuid().optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El negocio crea un pedido manual (por teléfono). 403 si está bloqueado. */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'business')
    const body = Schema.parse(await req.json())
    const service = createServiceClient()
    const { data, error } = await service.rpc('create_business_manual_order', {
      p_business_user_id: user.id,
      p_delivery_method: body.deliveryMethod,
      p_payment_intent: body.paymentIntent,
      p_customer_name: body.customerName ?? undefined,
      p_customer_phone: body.customerPhone ?? undefined,
      p_total_amount: body.totalAmount,
      p_prep_time_minutes: body.prepTimeMinutes,
      p_delivery_reference: body.deliveryReference ?? undefined,
      p_delivery_distance_band: body.deliveryDistanceBand,
      p_client_pays_with: body.clientPaysWith ?? undefined,
      p_yape_amount: body.yapeAmount ?? undefined,
      p_cash_amount: body.cashAmount ?? undefined,
      p_address_directory_id: body.addressDirectoryId ?? undefined,
    })
    if (error) {
      if (error.code === 'P0002') throw new DomainError(error.message, 'not_found')
      if (error.code === 'P0001') throw new DomainError(error.message, 'forbidden')
      throw new Error(error.message)
    }
    return ok(data, { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
