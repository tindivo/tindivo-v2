import { PrepayProofUploadUrlRequestSchema, UuidSchema } from '@tindivo/contracts'
import { PrepayProofUploadUrlSchema } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'
import { proofObjectPath } from '../domain/proof-path'
import { nextProofAttempt, signProofUpload } from '../infra/proof-upload'

/**
 * El servidor autoriza la subida del comprobante y la app nativa la hace con un PUT a la URL
 * firmada (no usa el SDK de Supabase). Después confirma con `POST .../prepay-proof {path}`, que
 * no cambia y vuelve a comprobar todo.
 */
export const prepayProofUploadUrlHandler = defineHandler(
  {
    module: 'ordering',
    method: 'POST',
    path: '/api/v1/customer/orders/{id}/prepay-proof/upload-url',
    auth: 'user',
    params: z.object({ id: UuidSchema }),
    body: PrepayProofUploadUrlRequestSchema,
    response: PrepayProofUploadUrlSchema,
  },
  async ({ actor, params, body, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
    const db = deps.supabase()
    const orderId = params.id.toLowerCase()
    const attempt = await nextProofAttempt(db, orderId, actor.userId)
    const now = deps.clock.now().getTime()
    const path = proofObjectPath({
      userId: actor.userId,
      orderId,
      attempt,
      now,
      contentType: body.contentType,
    })
    return signProofUpload(db, path, now)
  },
)
