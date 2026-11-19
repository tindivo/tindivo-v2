/**
 * 0293 · `reserve_phone_code`: el tope de envíos de código por usuario se reserva de forma atómica en la base, antes de
 * llamar a Twilio. Contra Supabase LOCAL, bajo candado. Las carreras lanzan las llamadas a la vez, sin esperar una
 * antes de otra. El permiso se prueba con sesiones reales (`anon` y `authenticated`), nunca con `service_role`.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@tindivo/supabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'test-password-12345'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

// La función aún no está en `database.types.ts` (se regenera tras aplicar la 0293 en la base remota).
type Reserve = (
  fn: 'reserve_phone_code',
  args: { p_user_id: string; p_phone: string; p_max: number },
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
const reserve = (client: { rpc: unknown }) => (client.rpc as Reserve).bind(client)

const users: string[] = []
const phone = () => `+519${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function newUser() {
  const email = `reserva-${crypto.randomUUID()}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Reserva' },
  })
  if (error) throw new Error(error.message)
  await db
    .from('customer_profiles')
    .insert({ user_id: data.user.id, full_name: 'Vecino Reserva' })
    .throwOnError()
  users.push(data.user.id)
  return { id: data.user.id, email }
}

async function attempts(userId: string) {
  const { count } = await db
    .from('customer_otp_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .throwOnError()
  return count ?? 0
}

afterAll(async () => {
  for (const id of users) {
    await db.from('customer_otp_attempts').delete().eq('user_id', id)
    await db.from('customer_profiles').delete().eq('user_id', id)
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
})

beforeAll(() => {
  expect(users).toHaveLength(0)
})

describe('0293 · reserve_phone_code', () => {
  it('CAX-002 · con tope 1 y ocho solicitudes simultáneas pasa una sola', async () => {
    const u = await newUser()
    const calls = Array.from({ length: 8 }, () =>
      reserve(db)('reserve_phone_code', { p_user_id: u.id, p_phone: phone(), p_max: 1 }),
    )
    const results = await Promise.all(calls)
    for (const r of results) expect(r.error).toBeNull()
    expect(results.filter((r) => r.data === true)).toHaveLength(1)
    expect(results.filter((r) => r.data === false)).toHaveLength(7)
    expect(await attempts(u.id)).toBe(1)
  })

  it('CAX-002 · con tope 3 y diez solicitudes simultáneas pasan exactamente tres', async () => {
    const u = await newUser()
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserve(db)('reserve_phone_code', { p_user_id: u.id, p_phone: phone(), p_max: 3 }),
      ),
    )
    expect(results.filter((r) => r.data === true)).toHaveLength(3)
    expect(await attempts(u.id)).toBe(3)
  })

  it('el tope es por usuario: otro usuario no gasta el cupo de este', async () => {
    const a = await newUser()
    const b = await newUser()
    expect(
      (await reserve(db)('reserve_phone_code', { p_user_id: a.id, p_phone: phone(), p_max: 1 }))
        .data,
    ).toBe(true)
    expect(
      (await reserve(db)('reserve_phone_code', { p_user_id: a.id, p_phone: phone(), p_max: 1 }))
        .data,
    ).toBe(false)
    expect(
      (await reserve(db)('reserve_phone_code', { p_user_id: b.id, p_phone: phone(), p_max: 1 }))
        .data,
    ).toBe(true)
  })

  it('lo de hace más de 24 horas no cuenta', async () => {
    const u = await newUser()
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString()
    await db
      .from('customer_otp_attempts')
      .insert([1, 2, 3].map(() => ({ user_id: u.id, phone: phone(), sent_at: old })))
      .throwOnError()
    expect(
      (await reserve(db)('reserve_phone_code', { p_user_id: u.id, p_phone: phone(), p_max: 1 }))
        .data,
    ).toBe(true)
  })

  it('un tope inválido o argumentos nulos fallan en vez de dejar pasar', async () => {
    const u = await newUser()
    for (const max of [0, -1]) {
      const r = await reserve(db)('reserve_phone_code', {
        p_user_id: u.id,
        p_phone: phone(),
        p_max: max,
      })
      expect(r.error).not.toBeNull()
    }
    expect(await attempts(u.id)).toBe(0)
  })

  it('CAX-002 · anon y un usuario autenticado (no propietario del cupo) no pueden llamarla', async () => {
    const owner = await newUser()
    const other = await newUser()
    const anon = createClient<Database>(URL, ANON_KEY, opts)
    const denied = await reserve(anon)('reserve_phone_code', {
      p_user_id: owner.id,
      p_phone: phone(),
      p_max: 9,
    })
    expect(denied.error?.code).toBe('42501')

    const session = createClient<Database>(URL, ANON_KEY, opts)
    const { error } = await session.auth.signInWithPassword({
      email: other.email,
      password: PASSWORD,
    })
    expect(error).toBeNull()
    const asOther = await reserve(session)('reserve_phone_code', {
      p_user_id: owner.id,
      p_phone: phone(),
      p_max: 9,
    })
    expect(asOther.error?.code).toBe('42501')
    expect(await attempts(owner.id)).toBe(0)
  })

  it('CAX-002 · una cuenta borrada no puede reservar', async () => {
    const u = await newUser()
    const { error } = await db.rpc('delete_customer_account', { p_user_id: u.id })
    expect(error).toBeNull()
    const r = await reserve(db)('reserve_phone_code', {
      p_user_id: u.id,
      p_phone: phone(),
      p_max: 3,
    })
    expect(r.error?.message).toContain('account was deleted')
  })
})
