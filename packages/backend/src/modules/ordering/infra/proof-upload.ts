import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'

const BUCKET = 'payment-proofs'
/** Lo que Supabase documenta para las URL firmadas de subida, si el token no trae `exp`. */
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000

/**
 * El intento que gastaría el próximo comprobante del pedido, preguntado a SQL
 * (`prepay_proof_next_attempt`, 0282): la regla de estado e intentos es la de
 * `register_prepay_proof`, no una copia. Pedido ajeno e inexistente salen igual (404).
 */
export async function nextProofAttempt(
  db: TypedSupabaseClient,
  orderId: string,
  customerUserId: string,
): Promise<number> {
  const { data, error } = await db.rpc('prepay_proof_next_attempt', {
    p_order_id: orderId,
    p_customer_user_id: customerUserId,
  })
  if (error) {
    if (error.code === 'P0002') throw new DomainError('Pedido no encontrado', 'not_found')
    if (error.code === 'P0001') {
      if (error.hint === 'order_not_awaiting_proof')
        throw new DomainError(error.message, 'invalid_state_transition')
      // Intentos agotados: lo mismo que responde `prepay-proof`.
      throw new DomainError(error.message, 'forbidden')
    }
    // Sin el texto del proveedor: el fallo viaja como `cause` y el logger solo lo describe.
    throw new Error('No se pudo consultar el intento del comprobante', { cause: error })
  }
  if (typeof data !== 'number') throw new Error('prepay_proof_next_attempt no devolvió un intento')
  return data
}

export interface SignedProofUpload {
  path: string
  uploadUrl: string
  token: string
  expiresAt: string
}

/** El `exp` del JWT de la URL firmada, en ms; `null` si el token no se deja leer. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString())
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/** URL firmada para subir UN archivo a `path`. Sin `upsert`: no sobrescribe (0258). */
export async function signProofUpload(
  db: TypedSupabaseClient,
  path: string,
  now: number,
): Promise<SignedProofUpload> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    // Sin el texto de Storage: puede traer la URL o el token. Va como `cause`, que el logger solo describe.
    throw new Error('No se pudo firmar la subida del comprobante', { cause: error ?? undefined })
  }
  const expiresMs = tokenExpiryMs(data.token) ?? now + DEFAULT_TTL_MS
  return {
    path: data.path,
    uploadUrl: data.signedUrl,
    token: data.token,
    expiresAt: new Date(expiresMs).toISOString(),
  }
}
