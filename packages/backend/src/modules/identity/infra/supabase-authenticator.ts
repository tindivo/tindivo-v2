import { type UserRole, UserRoleSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { Authenticator, AuthRequirement } from '../application/ports'
import type { Actor } from '../domain/actor'

/**
 * Verifica el token con `supabase.auth.getUser` (cliente service-role) y lee los roles de
 * `user_roles`. Mismo comportamiento y mismos mensajes que `apps/api/lib/http/auth.ts`.
 * Único sitio de este módulo que conoce el SDK (DES-2).
 */
export class SupabaseAuthenticator implements Authenticator {
  constructor(private readonly supabase: () => TypedSupabaseClient) {}

  async authenticate(request: Request, requirement: AuthRequirement): Promise<Actor> {
    const header = request.headers.get('authorization') ?? ''
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
    if (!token) {
      throw new DomainError('No autenticado', 'unauthorized')
    }

    const client = this.supabase()
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token)
    if (error || !user) {
      throw new DomainError('Sesión inválida o expirada', 'unauthorized')
    }

    const { data, error: rolesError } = await client
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    if (rolesError) {
      // Fallar fuerte (500 registrado) y no tratar el fallo como «sin roles»: eso daría un 403 falso.
      throw new Error(`No se pudieron leer los roles del usuario: ${rolesError.message}`)
    }
    const roles: UserRole[] = []
    for (const row of data ?? []) {
      const parsed = UserRoleSchema.safeParse(row.role)
      if (parsed.success) roles.push(parsed.data)
    }

    if (requirement === 'admin' && !roles.includes('admin')) {
      throw new DomainError("Se requiere el rol 'admin'", 'forbidden')
    }
    return { userId: user.id, roles, accessToken: token }
  }
}
