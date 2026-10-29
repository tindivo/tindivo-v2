import type { PREPAY_PROOF_CONTENT_TYPES } from '@tindivo/contracts'

type ProofContentType = (typeof PREPAY_PROOF_CONTENT_TYPES)[number]

const EXTENSION: Record<ProofContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/**
 * La ruta del comprobante en `payment-proofs`: la misma forma que sube la web
 * (`prepay-proof-section.tsx`) y que exige `register_prepay_proof` (0248):
 * `<usuario>/<pedido>/attempt-<n>-<ts>.<ext>`. `now` son milisegundos desde la época.
 */
export function proofObjectPath(input: {
  userId: string
  orderId: string
  attempt: number
  now: number
  contentType: ProofContentType
}): string {
  const { userId, orderId, attempt, now, contentType } = input
  return `${userId}/${orderId}/attempt-${attempt}-${now}.${EXTENSION[contentType]}`
}
