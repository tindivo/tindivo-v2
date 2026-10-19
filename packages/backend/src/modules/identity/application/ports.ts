import type { Actor } from '../domain/actor'

/** Qué exige la ruta: sesión válida (`user`) o, además, el rol `admin`. */
export type AuthRequirement = 'user' | 'admin'

export interface Authenticator {
  /**
   * Verifica el token de `Authorization: Bearer` y devuelve al actor.
   * Lanza `DomainError` `unauthorized` (sin token o token inválido) o `forbidden` (falta el rol).
   */
  authenticate(request: Request, requirement: AuthRequirement): Promise<Actor>
}
