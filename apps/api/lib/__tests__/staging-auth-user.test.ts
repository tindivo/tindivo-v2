import { describe, expect, it, vi } from 'vitest'
import { makeEnsureAuthUser } from '../../scripts/staging-auth-user.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const EMAIL = 'catalogo-brasero@staging.tindivo.local'

function setup(getUser: unknown) {
  const admin = {
    getUserById: vi.fn().mockResolvedValue(getUser),
    updateUserById: vi.fn().mockResolvedValue({ error: null }),
    createUser: vi.fn().mockResolvedValue({ error: null }),
  }
  const record = vi.fn(async (_entry: unknown, activate: () => Promise<void>) => activate())
  const ensure = makeEnsureAuthUser({
    admin,
    record,
    roleOf: () => 'business',
    newPassword: () => 'pw-de-prueba',
    log: () => {},
  })
  return { admin, record, ensure }
}

describe('makeEnsureAuthUser', () => {
  it('cuenta correcta: rota la contraseña', async () => {
    const { admin, ensure } = setup({ data: { user: { id: ID, email: EMAIL } }, error: null })
    await ensure(ID, EMAIL, 'Dueño')
    expect(admin.updateUserById).toHaveBeenCalledWith(ID, { password: 'pw-de-prueba' })
    expect(admin.createUser).not.toHaveBeenCalled()
  })

  it('compara el correo sin distinguir mayúsculas', async () => {
    const { admin, ensure } = setup({
      data: { user: { id: ID, email: EMAIL.toUpperCase() } },
      error: null,
    })
    await ensure(ID, EMAIL, 'Dueño')
    expect(admin.updateUserById).toHaveBeenCalled()
  })

  it('mismo id con otro correo: aborta sin rotar la contraseña ni guardarla', async () => {
    const { admin, record, ensure } = setup({
      data: { user: { id: ID, email: 'otra-persona@gmail.com' } },
      error: null,
    })
    await expect(ensure(ID, EMAIL, 'Dueño')).rejects.toThrow(/no coincide/)
    expect(admin.updateUserById).not.toHaveBeenCalled()
    expect(admin.createUser).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it('cuenta sin correo (p. ej. solo teléfono): aborta', async () => {
    const { admin, ensure } = setup({ data: { user: { id: ID } }, error: null })
    await expect(ensure(ID, EMAIL, 'Dueño')).rejects.toThrow(/no coincide/)
    expect(admin.updateUserById).not.toHaveBeenCalled()
  })

  it('error de consulta distinto de «no existe»: aborta', async () => {
    const { admin, ensure } = setup({
      data: { user: null },
      error: { message: 'boom', status: 500 },
    })
    await expect(ensure(ID, EMAIL, 'Dueño')).rejects.toThrow(/boom/)
    expect(admin.updateUserById).not.toHaveBeenCalled()
    expect(admin.createUser).not.toHaveBeenCalled()
  })

  it('no existe (404): la crea', async () => {
    const { admin, ensure } = setup({
      data: { user: null },
      error: { message: 'User not found', status: 404 },
    })
    await ensure(ID, EMAIL, 'Dueño')
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ id: ID, email: EMAIL }))
  })

  it('no existe (sin error): la crea', async () => {
    const { admin, ensure } = setup({ data: { user: null }, error: null })
    await ensure(ID, EMAIL, 'Dueño')
    expect(admin.createUser).toHaveBeenCalled()
  })
})
