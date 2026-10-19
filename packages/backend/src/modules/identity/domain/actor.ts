import type { UserRole } from '@tindivo/contracts'

/**
 * Quien hace la petición, ya verificado. La identidad sale del token, nunca del cuerpo (API-12).
 * `accessToken` hace falta para crear un cliente con la sesión del usuario y su RLS.
 */
export interface Actor {
  userId: string
  roles: UserRole[]
  accessToken: string
}
