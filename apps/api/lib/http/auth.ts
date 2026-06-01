import type { User } from '@supabase/supabase-js'
import type { UserRole } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { createServiceClient } from '../supabase/service'

export interface AuthContext {
  user: User
  token: string
}

/**
 * Exige sesión válida vía `Authorization: Bearer <jwt>`. La API es cross-origin
 * (REST consumido por las PWAs y, a futuro, Capacitor), así que la auth va por
 * token, no por cookies. Valida el JWT contra Supabase Auth.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  if (!token) {
    throw new DomainError('No autenticado', 'unauthorized')
  }
  const supabase = createServiceClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) {
    throw new DomainError('Sesión inválida o expirada', 'unauthorized')
  }
  return { user, token }
}

/** Exige que el usuario autenticado tenga el rol indicado (consulta user_roles). */
export async function requireRole(req: Request, role: UserRole): Promise<AuthContext> {
  const ctx = await requireUser(req)
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', ctx.user.id)
    .eq('role', role)
    .maybeSingle()
  if (!data) {
    throw new DomainError(`Se requiere el rol '${role}'`, 'forbidden')
  }
  return ctx
}
