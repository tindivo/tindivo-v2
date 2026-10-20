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
 */
export const NATIVE_PUSH_PAYLOAD_VERSION = 1

export const NativePushPayloadSchema = z.object({
  v: z.literal(NATIVE_PUSH_PAYLOAD_VERSION),
  type: z.string().min(1).max(64).meta({ description: 'Tipo de evento del outbox' }),
  tag: z
    .string()
    .min(1)
    .max(256)
    .meta({ description: 'Colapsa avisos repetidos; lleva el tipo de evento y el shortId' }),
  title: z.string().min(1).max(256),
  body: z.string().max(1024),
  deepLink: z
    .string()
    .max(512)
    .regex(/^\/(?!\/)/)
    .meta({ description: 'Ruta relativa de la app que abre el aviso' }),
})
export type NativePushPayload = z.infer<typeof NativePushPayloadSchema>
