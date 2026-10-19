import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import { SupabaseAuthenticator } from './supabase-authenticator'

interface FakeOptions {
  user?: { id: string } | null
  authError?: { message: string } | null
  roles?: Array<{ role: string }>
  rolesError?: { message: string } | null
}

function fakeClient(options: FakeOptions = {}) {
  const calls = {
    token: null as string | null,
    table: null as string | null,
    userId: null as string | null,
  }
  const client = {
    auth: {
      getUser: async (token: string) => {
        calls.token = token
        return {
          data: { user: options.user === undefined ? { id: 'u1' } : options.user },
          error: options.authError ?? null,
        }
      },
    },
    from: (table: string) => {
      calls.table = table
      return {
        select: () => ({
          eq: async (_column: string, userId: string) => {
            calls.userId = userId
            return { data: options.roles ?? [], error: options.rolesError ?? null }
          },
        }),
      }
    },
  }
  // Doble de prueba: solo implementa lo que usa el adaptador, no todo el cliente del SDK.
  const typed = client as unknown as TypedSupabaseClient
  return { authenticator: new SupabaseAuthenticator(() => typed), calls }
}

function requestWith(authorization?: string): Request {
  return new Request('http://localhost/api/v1/x', {
    headers: authorization === undefined ? {} : { authorization },
  })
}

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof DomainError) return err
    throw err
  }
  throw new Error('Se esperaba un rechazo')
}

describe('SupabaseAuthenticator', () => {
  it('rechaza con unauthorized si no hay cabecera authorization', async () => {
    const { authenticator } = fakeClient()
    const err = await rejection(authenticator.authenticate(requestWith(), 'user'))
    expect(err.code).toBe('unauthorized')
    expect(err.message).toBe('No autenticado')
  })

  it('rechaza con unauthorized si la cabecera no es bearer', async () => {
    const { authenticator } = fakeClient()
    const err = await rejection(authenticator.authenticate(requestWith('Basic abc'), 'user'))
    expect(err.code).toBe('unauthorized')
    expect(err.message).toBe('No autenticado')
  })

  it('rechaza con unauthorized si getUser devuelve error', async () => {
    const { authenticator } = fakeClient({ user: null, authError: { message: 'jwt expired' } })
    const err = await rejection(authenticator.authenticate(requestWith('Bearer t'), 'user'))
    expect(err.code).toBe('unauthorized')
    expect(err.message).toBe('Sesión inválida o expirada')
  })

  it('rechaza con unauthorized si getUser no devuelve usuario', async () => {
    const { authenticator } = fakeClient({ user: null })
    const err = await rejection(authenticator.authenticate(requestWith('Bearer t'), 'user'))
    expect(err.message).toBe('Sesión inválida o expirada')
  })

  it('devuelve al actor con su token y sus roles, aceptando «bearer» en minúsculas', async () => {
    const { authenticator, calls } = fakeClient({
      roles: [{ role: 'customer' }, { role: 'driver' }],
    })
    const actor = await authenticator.authenticate(requestWith('bearer  tok-1 '), 'user')
    expect(actor).toEqual({ userId: 'u1', roles: ['customer', 'driver'], accessToken: 'tok-1' })
    expect(calls).toEqual({ token: 'tok-1', table: 'user_roles', userId: 'u1' })
  })

  it('ignora roles que el contrato no conoce', async () => {
    const { authenticator } = fakeClient({ roles: [{ role: 'customer' }, { role: 'inventado' }] })
    const actor = await authenticator.authenticate(requestWith('Bearer t'), 'user')
    expect(actor.roles).toEqual(['customer'])
  })

  it("rechaza con forbidden si admin y falta el rol 'admin'", async () => {
    const { authenticator } = fakeClient({ roles: [{ role: 'customer' }] })
    const err = await rejection(authenticator.authenticate(requestWith('Bearer t'), 'admin'))
    expect(err.code).toBe('forbidden')
    expect(err.message).toBe("Se requiere el rol 'admin'")
  })

  it("deja pasar a admin cuando tiene el rol 'admin'", async () => {
    const { authenticator } = fakeClient({ roles: [{ role: 'admin' }] })
    const actor = await authenticator.authenticate(requestWith('Bearer t'), 'admin')
    expect(actor.roles).toContain('admin')
  })

  it('falla con error corriente (500) si no puede leer los roles, no con un 403 falso', async () => {
    const { authenticator } = fakeClient({ rolesError: { message: 'db caída' } })
    await expect(
      authenticator.authenticate(requestWith('Bearer t'), 'admin'),
    ).rejects.not.toBeInstanceOf(DomainError)
  })
})
