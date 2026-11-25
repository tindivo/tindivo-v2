/**
 * `ensureAuthUser` de la semilla de staging, con la identidad comprobada.
 *
 * Una cuenta hallada por ID solo recibe contraseña nueva si su correo es el esperado; si no, aborta
 * ANTES de guardar o rotar nada. Cualquier error de consulta distinto de «no existe» también aborta.
 */
import type { EnsureAuthUser } from './seed-world.ts'

interface AdminResult {
  data?: { user?: { id?: string; email?: string | null } | null } | null
  error?: { message: string; status?: number; code?: string } | null
}

export interface AuthAdmin {
  getUserById(id: string): Promise<AdminResult>
  updateUserById(id: string, attrs: { password: string }): Promise<{ error?: { message: string } | null }>
  createUser(attrs: {
    id: string
    email: string
    password: string
    email_confirm: boolean
    user_metadata: { full_name: string }
  }): Promise<{ error?: { message: string } | null }>
}

export interface EnsureAuthDeps {
  admin: AuthAdmin
  record: (
    entry: { email: string; role: string; password: string },
    activate: () => Promise<void>,
  ) => Promise<void>
  roleOf: (id: string) => string
  newPassword: () => string
  log: (line: string) => void
}

export function makeEnsureAuthUser(deps: EnsureAuthDeps): EnsureAuthUser {
  return async (id, email, fullName) => {
    const { data, error: lookupErr } = await deps.admin.getUserById(id)
    const notFound = lookupErr && (lookupErr.status === 404 || lookupErr.code === 'user_not_found')
    if (lookupErr && !notFound) {
      throw new Error(`consultar la cuenta ${id} falló: ${lookupErr.message}`)
    }
    const found = notFound ? null : (data?.user ?? null)
    if (found && (found.email ?? '').toLowerCase() !== email.toLowerCase()) {
      throw new Error(
        `ABORTADO: la cuenta ${id} existe con otro correo; no coincide con ${email}. No se toca.`,
      )
    }
    const password = deps.newPassword()
    await deps.record({ email, role: deps.roleOf(id), password }, async () => {
      if (found) {
        const { error } = await deps.admin.updateUserById(id, { password })
        if (error) throw new Error(`actualizar contraseña de ${email} falló: ${error.message}`)
        deps.log(`  ✓ auth.users                  ${email} (ya existía, contraseña nueva)`)
      } else {
        const { error } = await deps.admin.createUser({
          id,
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        })
        if (error) throw new Error(`crear auth user ${email} falló: ${error.message}`)
        deps.log(`  ✓ auth.users                  ${email} (creado)`)
      }
    })
  }
}
