import { z } from 'zod'
import { PhonePeSchema } from './primitives'

/**
 * Cuerpos de las rutas del cliente que vivían escritos dentro de su `route.ts`.
 * Suben aquí para que el OpenAPI y la ruta lean EL MISMO esquema: si una cambia,
 * cambia la otra (lote MV2b). Son los de siempre, sin una regla de más ni de
 * menos.
 */

/** POST /customer/phone/send-code */
export const SendPhoneCodeRequestSchema = z.object({
  phone: PhonePeSchema,
})

/** POST /customer/phone/verify */
export const VerifyPhoneCodeRequestSchema = z.object({
  phone: PhonePeSchema,
  code: z.string().length(6, 'El código debe tener 6 dígitos'),
})

/** POST /customer/orders/{id}/prepay-proof — la ruta del archivo YA subido a Storage. */
export const PrepayProofRequestSchema = z.object({
  path: z.string().trim().min(1).max(500).meta({
    description: 'Ruta dentro del bucket `payment-proofs`; empieza por `<id del usuario>/`',
  }),
})

/**
 * POST /customer/orders/{id}/appeal. No es `CreateAppealSchema`: aquel es
 * `.strict()` y esta ruta siempre ha aceptado propiedades de más.
 */
export const CreateOrderAppealRequestSchema = z.object({
  description: z.string().trim().max(500).optional(),
})

/** POST /push/subscriptions */
export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
  userAgent: z.string().max(400).optional(),
  /**
   * UUID por instalación de PWA, generado y guardado por el cliente. Es la
   * identidad REAL del dispositivo; `userAgent` no lo es. Opcional porque un
   * cliente sin actualizar no lo manda todavía.
   */
  installId: z.string().min(8).max(64).optional(),
})

/**
 * DELETE /push/subscriptions. Tres formas excluyentes: `{ endpoint }` (este
 * dispositivo, al cerrar sesión aquí), `{ id }` (una fila de la lista de
 * dispositivos) o `{ all: true }` (todos).
 *
 * `all` existe para acompañar a `signOutEverywhere`. Revocar las sesiones sin
 * borrar las suscripciones dejaría al dispositivo perdido sin poder abrir nada
 * pero AÚN recibiendo notificaciones, que llevan nombre y dirección del cliente
 * en la vista previa: el acceso se corta y la fuga de datos sigue.
 */
export const PushUnsubscribeRequestSchema = z.union([
  z.object({ endpoint: z.string().url().max(1000) }),
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
])
