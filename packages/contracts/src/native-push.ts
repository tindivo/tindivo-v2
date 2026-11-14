import { z } from 'zod'

/**
 * Payload del aviso que `send-push` manda a las apps nativas (APNs y FCM), versión 1.
 *
 * Es lo que el cliente decodifica al recibir el aviso (CLI-8). Se versiona como la API
 * (API-3, DES-10): solo se añaden campos OPCIONALES; un cambio incompatible es una versión
 * nueva (`v: 2`) y las apps instaladas siguen entendiendo la 1.
 *
 * La Edge Function de Deno no puede importar este paquete: el test de
 * `apps/api/lib/__tests__/send-push-native.test.ts` comprueba que lo que construye
 * `supabase/functions/send-push/native.ts` cumple este esquema.
 *
 * `deepLink` es una RUTA RELATIVA de la propia app (`/pedido/AB2C3D4E`), nunca una URL con
 * host: la app decide qué pantalla abre. En FCM viaja en `data` (todo como texto); en APNs,
 * en el cuerpo junto a `aps`.
 *
 * `step`/`steps`/`terminal` (opcionales, solo en FCM): el seguimiento del pedido o la entrega en
 * una notificación fija de Android con barra de progreso. Los calcula `send-push` del estado real
 * (`supabase/functions/send-push/order-tracking.ts`). Un aviso sin ellos se pinta como siempre.
 */
export const NATIVE_PUSH_PAYLOAD_VERSION = 1

/**
 * Paso del seguimiento como texto (en FCM `data` todo viaja como texto): entero positivo, sin
 * ceros a la izquierda y de hasta dos cifras.
 */
const STEP_TEXT = z.string().regex(/^[1-9][0-9]?$/)

export const NativePushPayloadSchema = z
  .object({
    v: z.literal(NATIVE_PUSH_PAYLOAD_VERSION),
    type: z.string().min(1).max(64).meta({ description: 'Tipo de evento del outbox' }),
    tag: z
      .string()
      .min(1)
      .max(256)
      .meta({ description: 'Colapsa avisos repetidos; lleva el tipo de evento y el shortId' }),
    group: z.string().min(1).max(256).optional().meta({
      description:
        'Llave de presentación: los avisos con el mismo group se reemplazan en el teléfono (order-<shortId>, courier-<shortId>). Sin ella, vale tag',
    }),
    title: z.string().min(1).max(256),
    body: z.string().max(1024),
    deepLink: z
      .string()
      .max(512)
      .regex(/^\/(?!\/)/)
      .meta({ description: 'Ruta relativa de la app que abre el aviso' }),
    step: STEP_TEXT.optional().meta({
      description:
        'Paso actual del pedido o la entrega (entero ≥ 1 como texto). Va junto con steps y step ≤ steps. Sin ellos, no hay barra de progreso',
    }),
    steps: STEP_TEXT.optional().meta({
      description: 'Total de pasos del seguimiento (entero ≥ 1 como texto)',
    }),
    install: z.string().min(8).max(64).optional().meta({
      description:
        'installId de la instalación destinataria (push_devices.install_id). La app descarta un aviso cuyo install no es el de su instalación vigente',
    }),
    seq: z
      .string()
      .regex(/^[1-9][0-9]{9,15}$/)
      .optional()
      .meta({
        description:
          'Versión del estado del pedido (updated_at en ms). La app ignora un aviso con seq menor al ya mostrado',
      }),
    terminal: z.literal('1').optional().meta({
      description:
        'Presente si el estado es final (entregado, cancelado): el seguimiento deja de ser fijo',
    }),
  })
  .superRefine((p, ctx) => {
    if ((p.step === undefined) !== (p.steps === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'step y steps van juntos', path: ['step'] })
    } else if (p.step !== undefined && p.steps !== undefined && Number(p.step) > Number(p.steps)) {
      ctx.addIssue({ code: 'custom', message: 'step no puede pasar de steps', path: ['step'] })
    }
  })
export type NativePushPayload = z.infer<typeof NativePushPayloadSchema>
