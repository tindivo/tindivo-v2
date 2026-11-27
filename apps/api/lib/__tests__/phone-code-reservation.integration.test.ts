/**
 * 0293 · `reserve_phone_code` y `release_phone_code`: el tope de envíos de código por usuario se reserva de forma
 * atómica en la base, antes de llamar a Twilio. Contra Supabase LOCAL, bajo candado. El orden de dos transacciones se
 * prueba con dos sesiones `psql` reales (una transacción abierta toma el candado; la otra espera, medida en
 * `pg_stat_activity`). El permiso se prueba con sesiones reales (`anon` y `authenticated`), nunca con `service_role`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@tindivo/supabase'
import { afterAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'test-password-12345'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const PSQL = ['exec', '-i', 'supabase_db_zpnipajgwfthxhdtzhly', 'psql', '-U', 'postgres', '-At']

// Las funciones aún no están en `database.types.ts` (se regenera tras aplicar la 0293 en la base remota).
type Rpc = (
  fn: 'reserve_phone_code' | 'release_phone_code',
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
const rpc = (client: { rpc: unknown }) => (client.rpc as Rpc).bind(client)
const reserve = (client: { rpc: unknown }, userId: string, max: number) =>
  rpc(client)('reserve_phone_code', { p_user_id: userId, p_phone: phone(), p_max: max })

const users: string[] = []
const phone = () => `+519${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const isId = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)

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

describe('0293 · reserve_phone_code', () => {
  it('CA-AUT-14 · T1 abre una transacción y toma el candado; T2 espera hasta que T1 confirma y entonces ve su envío', async () => {
    const u = await newUser()
    const order: string[] = []
    // T1: transacción abierta que reserva y NO confirma.
    const t1 = spawn('docker', PSQL, { stdio: ['pipe', 'pipe', 'pipe'] })
    const t1Exit = new Promise<number | null>((resolve, reject) => {
      t1.once('error', reject)
      t1.once('exit', resolve)
    })
    let output = ''
    const locked = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('T1 no tomó el candado')), 10_000)
      t1.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        if (output.includes('T1_RESERVED:')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    t1.stdin.write(
      `begin; select 'T1_RESERVED:' || coalesce(public.reserve_phone_code('${u.id}'::uuid, '${phone()}', 1)::text, 'null');\n`,
    )
    await locked
    order.push('T1 reservó')

    // T2: la misma reserva por HTTP (service_role). Debe quedar esperando el candado de T1.
    let t2Done = false
    const t2 = reserve(db, u.id, 1).then((r) => {
      t2Done = true
      order.push('T2 respondió')
      return r
    })
    let waiting = 0
    const deadline = Date.now() + 10_000
    while (waiting < 1 && Date.now() < deadline) {
      const raw = execFileSync('docker', PSQL, {
        input:
          "select count(*) from pg_stat_activity where state = 'active' and wait_event_type = 'Lock' and wait_event = 'advisory' and query like '%reserve_phone_code%';",
        encoding: 'utf8',
      })
      waiting = Number(raw.trim())
      if (waiting < 1) await new Promise((resolve) => setTimeout(resolve, 30))
    }
    expect(waiting, 'T2 debe estar esperando el candado de T1').toBeGreaterThanOrEqual(1)
    expect(t2Done).toBe(false)

    // T1 confirma: T2 se libera, cuenta el envío de T1 y se deniega.
    order.push('T1 confirma')
    t1.stdin.end('commit;\n')
    expect(await t1Exit).toBe(0)
    const result = await t2

    expect(order).toEqual(['T1 reservó', 'T1 confirma', 'T2 respondió'])
    expect(output).toMatch(/T1_RESERVED:[0-9a-f-]{36}/)
    expect(result.error).toBeNull()
    expect(result.data).toBeNull()
    expect(await attempts(u.id)).toBe(1)
  })

  it('CA-AUT-14 · con tope 1 y ocho solicitudes simultáneas pasa una sola', async () => {
    const u = await newUser()
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(db, u.id, 1)))
    for (const r of results) expect(r.error).toBeNull()
    expect(results.filter((r) => isId(r.data))).toHaveLength(1)
    expect(results.filter((r) => r.data === null)).toHaveLength(7)
    expect(await attempts(u.id)).toBe(1)
  })

  it('CA-AUT-14 · con tope 3 y diez solicitudes simultáneas pasan exactamente tres', async () => {
    const u = await newUser()
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(db, u.id, 3)))
    expect(results.filter((r) => isId(r.data))).toHaveLength(3)
    expect(await attempts(u.id)).toBe(3)
  })

  it('el tope es por usuario: otro usuario no gasta el cupo de este', async () => {
    const a = await newUser()
    const b = await newUser()
    expect(isId((await reserve(db, a.id, 1)).data)).toBe(true)
    expect((await reserve(db, a.id, 1)).data).toBeNull()
    expect(isId((await reserve(db, b.id, 1)).data)).toBe(true)
  })

  it('lo de hace más de 24 horas no cuenta', async () => {
    const u = await newUser()
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString()
    await db
      .from('customer_otp_attempts')
      .insert([1, 2, 3].map(() => ({ user_id: u.id, phone: phone(), sent_at: old })))
      .throwOnError()
    expect(isId((await reserve(db, u.id, 1)).data)).toBe(true)
  })

  it('un tope inválido o argumentos nulos fallan en vez de dejar pasar', async () => {
    const u = await newUser()
    for (const max of [0, -1]) expect((await reserve(db, u.id, max)).error).not.toBeNull()
    expect(await attempts(u.id)).toBe(0)
  })

  it('CA-AUT-14 · anon y un usuario autenticado (no propietario del cupo) no pueden llamarla', async () => {
    const owner = await newUser()
    const other = await newUser()
    const anon = createClient<Database>(URL, ANON_KEY, opts)
    expect((await reserve(anon, owner.id, 9)).error?.code).toBe('42501')

    const session = createClient<Database>(URL, ANON_KEY, opts)
    const { error } = await session.auth.signInWithPassword({
      email: other.email,
      password: PASSWORD,
    })
    expect(error).toBeNull()
    expect((await reserve(session, owner.id, 9)).error?.code).toBe('42501')
    expect(await attempts(owner.id)).toBe(0)
  })

  it('CA-AUT-14 · una cuenta borrada no puede reservar', async () => {
    const u = await newUser()
    const { error } = await db.rpc('delete_customer_account', { p_user_id: u.id })
    expect(error).toBeNull()
    const r = await reserve(db, u.id, 3)
    expect(r.error?.message).toContain('account was deleted')
  })
})

describe('0293 · release_phone_code', () => {
  it('CA-AUT-14 · devuelve el cupo: tras liberar, el mismo usuario vuelve a poder reservar', async () => {
    const u = await newUser()
    const first = await reserve(db, u.id, 1)
    expect(isId(first.data)).toBe(true)
    expect((await reserve(db, u.id, 1)).data).toBeNull()

    const released = await rpc(db)('release_phone_code', {
      p_user_id: u.id,
      p_attempt_id: first.data,
    })
    expect(released.error).toBeNull()
    expect(released.data).toBe(true)
    expect(await attempts(u.id)).toBe(0)
    expect(isId((await reserve(db, u.id, 1)).data)).toBe(true)
  })

  it('CA-AUT-14 · solo libera la fila de ese usuario: un id ajeno no borra nada', async () => {
    const a = await newUser()
    const b = await newUser()
    const ofA = await reserve(db, a.id, 3)
    const released = await rpc(db)('release_phone_code', {
      p_user_id: b.id,
      p_attempt_id: ofA.data,
    })
    expect(released.data).toBe(false)
    expect(await attempts(a.id)).toBe(1)
  })

  it('CA-AUT-14 · anon y un usuario autenticado no pueden liberar el cupo de otro', async () => {
    const owner = await newUser()
    const other = await newUser()
    const reserved = await reserve(db, owner.id, 3)
    const args = { p_user_id: owner.id, p_attempt_id: reserved.data }
    const anon = createClient<Database>(URL, ANON_KEY, opts)
    expect((await rpc(anon)('release_phone_code', args)).error?.code).toBe('42501')

    const session = createClient<Database>(URL, ANON_KEY, opts)
    await session.auth.signInWithPassword({ email: other.email, password: PASSWORD })
    expect((await rpc(session)('release_phone_code', args)).error?.code).toBe('42501')
    expect(await attempts(owner.id)).toBe(1)
  })
})
