/**
 * Migración 0266 (PROD-001): una cuenta borrada no puede apelar. Contra la base LOCAL.
 *
 * El JWT sigue siendo válido tras `delete_customer_account`, así que una sesión ya
 * autenticada podía llegar a `create_appeal_report` DESPUÉS del commit del borrado y
 * escribir texto personal en `order_event_log` ya anonimizado.
 *
 *  · Identidad del cuerpo: el de la 0266 es el de la 0262 salvo el bloque marcado.
 *  · Orden 1 (borrado primero): P0001 `account_deleted`, nada nuevo en reports,
 *    order_event_log ni domain_events; por SQL con claims y por PostgREST con el JWT.
 *  · Orden 2 (carrera real, dos conexiones `psql` simultáneas, en los dos sentidos).
 */
import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as postAppeal } from '../../app/api/v1/customer/orders/[id]/appeal/route'
import {
  cleanupLedgerWorld,
  type LedgerWorld,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient as db } from './helpers/local-db'
import { cleanupPhoneSecurityFixtures } from './helpers/phone-security-fixtures'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CLAVE = 'test-password-12345'
const TEXTO = 'Texto personal de la apelacion 0266'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const MIGRACIONES = join(__dirname, '../../../../supabase/migrations')

interface Cliente {
  id: string
  token: string
  client: ReturnType<typeof createClient>
}

const creados: string[] = []
let world: LedgerWorld

async function crearCliente(): Promise<Cliente> {
  const email = `apelacion-borrada-${crypto.randomUUID().slice(0, 8)}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Apelacion 0266' },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  creados.push(data.user.id)
  const client = createClient(URL, ANON_KEY, opts)
  const { data: s, error: serr } = await client.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  return { id: data.user.id, token: s.session.access_token, client }
}

/** Pedido cancelado por comprobante rechazado, del cliente, apelable y sin reporte previo. */
async function pedidoApelable(c: Cliente): Promise<string> {
  const id = await seedOrder(world)
  const { error } = await db
    .from('orders')
    .update({
      customer_user_id: c.id,
      status: 'cancelled',
      cancel_reason: 'proof_rejected_final',
      cancelled_at: new Date().toISOString(),
      customer_phone: '+51999111222',
    })
    .eq('id', id)
  if (error) throw new Error(`preparar el pedido falló: ${error.message}`)
  return id
}

// biome-ignore lint/suspicious/noExplicitAny: delete_customer_account no está en database.types.ts
const borrar = (userId: string) => (db as any).rpc('delete_customer_account', { p_user_id: userId })

/** Ejecuta SQL en la base local por stdin (los acentos no se corrompen). */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  )
}

/** SQL que se presenta como el usuario autenticado (claims del JWT + rol), dentro de la transacción abierta. */
const comoUsuario = (userId: string): string =>
  `select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
set local role authenticated;`

const apelarSql = (orderId: string): string =>
  `select 'RES|' || public.create_appeal_report('${orderId}', '${TEXTO}')::text;`

interface Rastro {
  reports: number
  eventLog: number
  domainEvents: number
  textoEnLog: number
}

async function rastro(orderId: string): Promise<Rastro> {
  const cuenta = async (tabla: 'reports' | 'order_event_log' | 'domain_events') => {
    const col = tabla === 'domain_events' ? 'aggregate_id' : 'order_id'
    const { count, error } = await db
      .from(tabla)
      .select('*', { count: 'exact', head: true })
      .eq(col, orderId)
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  const { data } = await db.from('order_event_log').select('data').eq('order_id', orderId)
  return {
    reports: await cuenta('reports'),
    eventLog: await cuenta('order_event_log'),
    domainEvents: await cuenta('domain_events'),
    textoEnLog: (data ?? []).filter((r) => JSON.stringify(r.data).includes(TEXTO)).length,
  }
}

/** Una conexión `psql` viva, para intercalar transacciones de verdad. */
class Sesion {
  private proc: ChildProcessWithoutNullStreams
  private salida = ''
  constructor() {
    this.proc = spawn('docker', [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-At',
      '-v',
      'VERBOSITY=verbose',
      '-f',
      '-',
    ])
    this.proc.stdout.setEncoding('utf8')
    this.proc.stderr.setEncoding('utf8')
    this.proc.stdout.on('data', (d: string) => {
      this.salida += d
    })
    this.proc.stderr.on('data', (d: string) => {
      this.salida += d
    })
  }
  enviar(sql: string): void {
    this.proc.stdin.write(`${sql}\n`)
  }
  async esperar(marca: string, ms = 20000): Promise<string> {
    const limite = Date.now() + ms
    while (Date.now() < limite) {
      if (this.salida.includes(marca)) return this.salida
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`sin "${marca}" tras ${ms} ms; salida:\n${this.salida}`)
  }
  /** Nada de `marca` durante `ms`: la sentencia sigue esperando. */
  async noAparece(marca: string, ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
    expect(this.salida).not.toContain(marca)
  }
  texto(): string {
    return this.salida
  }
  cerrar(): void {
    this.proc.stdin.end()
    this.proc.kill()
  }
}

/** Cuántas sesiones esperan un candado ahora mismo con esa sentencia. */
function esperandoCandado(fragmento: string): number {
  return Number(
    psql(
      `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%${fragmento}%' and pid <> pg_backend_pid();`,
    ).trim(),
  )
}

async function hasta(cond: () => boolean, ms = 10000): Promise<void> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('la condición no se cumplió a tiempo')
}

beforeAll(async () => {
  world = await seedLedgerWorld()
})

afterAll(async () => {
  if (world) {
    await db.from('reports').delete().in('order_id', world.orderIds)
    await cleanupLedgerWorld(world)
  }
  for (const id of creados) {
    await db.from('reports').delete().eq('customer_user_id', id)
    // 0278: una cuenta borrada deja su historia del número.
    await cleanupPhoneSecurityFixtures(db, [id])
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0266 · el cuerpo es el de la 0262 salvo el bloque nuevo', () => {
  function cuerpo(archivo: string): string {
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8')
    const ini = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_appeal_report')
    const fin = sql.indexOf('$$;', sql.indexOf('AS $$', ini))
    expect(ini).toBeGreaterThan(-1)
    expect(fin).toBeGreaterThan(ini)
    return sql.slice(ini, fin + 3)
  }

  it('quitando la variable y el bloque marcados, queda byte a byte el de la 0262', () => {
    const vieja = cuerpo(
      '0262_el_seguimiento_de_entregas_ya_no_es_publico_y_la_apelacion_pide_dueno.sql',
    )
    const nueva = cuerpo('0266_una_cuenta_borrada_no_apela.sql')
    expect(nueva).not.toBe(vieja)
    const sinBloque = nueva
      .replace(/ {2}-- >>> 0266\n[\s\S]*? {2}-- <<< 0266\n\n/, '')
      .replace(/ {2}v_deleted timestamptz; -- 0266\n/, '')
    expect(sinBloque).toBe(vieja)
  })

  it('en la base queda UNA sola función, con search_path vacío y los grants de siempre', () => {
    const out = psql(`
select 'N|' || count(*) from pg_proc where proname = 'create_appeal_report';
select 'CFG|' || proconfig::text from pg_proc where proname = 'create_appeal_report';
select 'AUTH|' || has_function_privilege('authenticated', 'public.create_appeal_report(uuid, text)', 'execute');
select 'ANON|' || has_function_privilege('anon', 'public.create_appeal_report(uuid, text)', 'execute');
`)
    expect(out).toContain('N|1')
    expect(out).toContain('CFG|{"search_path=\\"\\""}')
    expect(out).toContain('AUTH|true')
    expect(out).toContain('ANON|false')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0266 · orden 1: el borrado llega primero', () => {
  it('por SQL con los claims del usuario: P0001 account_deleted y nada escrito', async () => {
    const c = await crearCliente()
    const orderId = await pedidoApelable(c)
    const { data, error } = await borrar(c.id)
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'deleted' })
    const antes = await rastro(orderId)

    const sql = `
begin;
${comoUsuario(c.id)}
\\set VERBOSITY verbose
${apelarSql(orderId)}
rollback;
`
    let fallo = ''
    try {
      psql(sql)
    } catch (e) {
      fallo = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(fallo).toContain('P0001')
    expect(fallo).toContain('Esta cuenta fue eliminada')

    const despues = await rastro(orderId)
    expect(despues).toEqual(antes)
    expect(despues.reports).toBe(0)
    expect(despues.textoEnLog).toBe(0)
  })

  it('por PostgREST con el JWT que sigue siendo válido: mismo error, sin filas nuevas', async () => {
    const c = await crearCliente()
    const orderId = await pedidoApelable(c)
    expect((await borrar(c.id)).error).toBeNull()
    const antes = await rastro(orderId)

    const { data, error } = await c.client.rpc('create_appeal_report', {
      p_order_id: orderId,
      p_description: TEXTO,
    })
    expect(data).toBeNull()
    expect(error?.code).toBe('P0001')
    expect(error?.hint).toBe('account_deleted')
    expect(error?.message).toBe('Esta cuenta fue eliminada')

    const despues = await rastro(orderId)
    expect(despues).toEqual(antes)
    expect(despues.reports).toBe(0)
    expect(despues.eventLog).toBe(antes.eventLog)
    expect(despues.domainEvents).toBe(antes.domainEvents)
    expect(despues.textoEnLog).toBe(0)
  })

  it('por la ruta de la API la misma sesión ya no pasa ni del rol (403) y no se crea nada', async () => {
    // `delete_customer_account` borra `user_roles`: `requireRole` corta antes de la RPC.
    // Este caso NO prueba la 0266 (la ruta ya cerraba la puerta tras el commit); la 0266
    // cubre la ventana en que la petición ya pasó `requireRole` antes del borrado.
    const c = await crearCliente()
    const orderId = await pedidoApelable(c)
    expect((await borrar(c.id)).error).toBeNull()
    const antes = await rastro(orderId)

    const res = await postAppeal(
      new Request(`http://localhost:3001/api/v1/customer/orders/${orderId}/appeal`, {
        method: 'POST',
        headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ description: TEXTO }),
      }),
      { params: Promise.resolve({ id: orderId }) },
    )
    expect([401, 403]).toContain(res.status)
    expect(await rastro(orderId)).toEqual(antes)
  })

  it('el borrado doble sigue devolviendo already_deleted', async () => {
    const c = await crearCliente()
    expect((await borrar(c.id)).data).toMatchObject({ status: 'deleted' })
    expect((await borrar(c.id)).data).toMatchObject({ status: 'already_deleted' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0266 · orden 2: carrera real con dos conexiones', () => {
  it('la apelación entra primero: el borrado espera, ve el reporte y queda blocked', async () => {
    const c = await crearCliente()
    const orderId = await pedidoApelable(c)
    const a = new Sesion()
    const b = new Sesion()
    try {
      a.enviar(`begin;\n${comoUsuario(c.id)}\n${apelarSql(orderId)}\nselect 'A_LISTA';`)
      await a.esperar('A_LISTA')
      expect(a.texto()).toContain('RES|')
      expect(a.texto()).toContain('"alreadyExisted": false')

      b.enviar(
        `select 'B_ARRANCA';\nselect 'BRES|' || public.delete_customer_account('${c.id}')::text;`,
      )
      await b.esperar('B_ARRANCA')
      await hasta(() => esperandoCandado('delete_customer_account') >= 1)
      await b.noAparece('BRES|', 1000)

      a.enviar(`commit;\nselect 'A_FIN';`)
      await a.esperar('A_FIN')
      await b.esperar('BRES|')
      expect(b.texto()).toContain('"status": "blocked"')
      expect(b.texto()).toContain('"reason": "open_money_reports"')

      const { data: u } = await db.from('users').select('deleted_at').eq('id', c.id).single()
      expect(u?.deleted_at).toBeNull()
      const r = await rastro(orderId)
      expect(r.reports).toBe(1)
      expect(r.textoEnLog).toBe(1)
    } finally {
      a.cerrar()
      b.cerrar()
    }
  }, 60000)

  it('el borrado entra primero: la apelación espera, falla con account_deleted y no escribe', async () => {
    const c = await crearCliente()
    const orderId = await pedidoApelable(c)
    const antes = await rastro(orderId)
    const a = new Sesion()
    const b = new Sesion()
    try {
      b.enviar(
        `begin;\nselect 'BRES|' || public.delete_customer_account('${c.id}')::text;\nselect 'B_LISTA';`,
      )
      await b.esperar('B_LISTA')
      expect(b.texto()).toContain('"status": "deleted"')

      a.enviar(`begin;\n${comoUsuario(c.id)}\nselect 'A_ARRANCA';\n${apelarSql(orderId)}`)
      await a.esperar('A_ARRANCA')
      await hasta(() => esperandoCandado('create_appeal_report') >= 1)
      await a.noAparece('RES|', 1000)

      b.enviar(`commit;\nselect 'B_FIN';`)
      await b.esperar('B_FIN')
      await a.esperar('Esta cuenta fue eliminada')
      expect(a.texto()).toContain('P0001')
      expect(a.texto()).not.toContain('RES|')
      a.enviar('rollback;')

      const { data: u } = await db.from('users').select('deleted_at').eq('id', c.id).single()
      expect(u?.deleted_at).not.toBeNull()
      const despues = await rastro(orderId)
      expect(despues).toEqual(antes)
      expect(despues.reports).toBe(0)
      expect(despues.textoEnLog).toBe(0)
    } finally {
      a.cerrar()
      b.cerrar()
    }
  }, 60000)
})
