/**
 * MV7a, CAX-001: carreras de `register_push_device` (0268). Contra la base LOCAL.
 *
 *  · Abrazo mortal (SQL, dos sesiones `psql` vivas). Dos registros que se cruzan los tokens
 *    se borran la fila el uno al otro y esperan: la base aborta UNO con 40P01. Un disparador
 *    de prueba que duerme tras cada borrado (solo en las sesiones que lo piden) fuerza el
 *    intercalado sin depender del azar. Sin duplicados y sin reasignar una instalación ajena.
 *  · Por la RUTA real: 20 rondas de intercambio cruzado simultáneo. Nunca un 500.
 *  · Registro y borrado de cuenta simultáneos, en los dos órdenes: o el borrado espera y el
 *    dispositivo cae por la cascada, o el registro falla con `account_deleted`. Nunca queda
 *    un token de una cuenta borrada.
 */
import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PUT } from '../../app/api/v1/push/devices/[installId]/route'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CLAVE = 'test-password-12345'
const RUN = Math.random().toString(36).slice(2, 8)

interface Usuario {
  id: string
  token: string
}

const usuarios: string[] = []
let secuencia = 0

async function crearUsuario(): Promise<Usuario> {
  secuencia += 1
  const email = `push-carreras-${RUN}-${secuencia}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino MV7a carreras' },
  })
  if (error) throw new Error(`crear usuario falló: ${error.message}`)
  const id = data.user.id
  usuarios.push(id)
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: serr } = await client.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  return { id, token: s.session.access_token }
}

const nuevoInstallId = (): string => crypto.randomUUID()
const nuevoToken = (): string => `tok-${RUN}-${crypto.randomUUID()}`

async function registrar(u: Usuario, installId: string, token: string) {
  const res = await PUT(
    new Request(`http://localhost:3001/api/v1/push/devices/${installId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${u.token}` },
      body: JSON.stringify({
        platform: 'ios',
        app: 'customer',
        token,
        appVersion: '1.0.0',
        notificationsEnabled: true,
      }),
    }),
    { params: Promise.resolve({ installId }) },
  )
  return res.status
}

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8' },
  ).trim()
}

interface Fila {
  install_id: string
  user_id: string
  token: string
}

async function filasDe(installIds: string[], tokens: string[]): Promise<Fila[]> {
  const { data, error } = await db
    .from('push_devices')
    .select('install_id, user_id, token')
    .or(`install_id.in.(${installIds.join(',')}),token.in.(${tokens.join(',')})`)
  if (error) throw new Error(error.message)
  return data
}

/** Registro por SQL, tal como lo llama la API (el actor va explícito). */
const registroSql = (actor: string, installId: string, token: string): string =>
  `select 'REG|' || (public.register_push_device('${actor}', '${installId}', 'ios', 'customer', '${token}', 'production', '1.0.0', null, null, null, null, true)).install_id;`

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
  async esperar(marca: string, ms = 30000): Promise<string> {
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

const TRIGGER_DORMILON = `
create or replace function public.zz_push_test_sleep() returns trigger language plpgsql as $fn$
begin
  if current_setting('tindivo.test_sleep', true) = '1' then perform pg_sleep(1.5); end if;
  return old;
end
$fn$;
drop trigger if exists zz_push_test_sleep on public.push_devices;
create trigger zz_push_test_sleep after delete on public.push_devices
  for each row execute function public.zz_push_test_sleep();
`

const QUITAR_TRIGGER = `
drop trigger if exists zz_push_test_sleep on public.push_devices;
drop function if exists public.zz_push_test_sleep();
`

beforeAll(() => {
  psql(QUITAR_TRIGGER)
})

afterAll(async () => {
  psql(QUITAR_TRIGGER)
  for (const id of usuarios.splice(0)) {
    await db.from('push_devices').delete().eq('user_id', id)
    await db.auth.admin.deleteUser(id)
  }
})

async function dosCruzados(
  a: { actor: string; installId: string; tokenNuevo: string },
  b: { actor: string; installId: string; tokenNuevo: string },
): Promise<{ s1: Sesion; s2: Sesion }> {
  const s1 = new Sesion()
  const s2 = new Sesion()
  const cuerpo = (x: typeof a) =>
    `begin;\nset local tindivo.test_sleep = '1';\n${registroSql(x.actor, x.installId, x.tokenNuevo)}\ncommit;\nselect 'FIN|';`
  // Las dos a la vez: cada una borra la fila de la otra y duerme con ella bloqueada.
  s1.enviar(cuerpo(a))
  s2.enviar(cuerpo(b))
  await Promise.all([s1.esperar('FIN|'), s2.esperar('FIN|')])
  return { s1, s2 }
}

describe('abrazo mortal entre dos registros cruzados (SQL, dos sesiones)', () => {
  it('el mismo usuario: la base aborta una con 40P01, la otra gana y queda un token por fila', async () => {
    const u = await crearUsuario()
    const [i1, i2] = [nuevoInstallId(), nuevoInstallId()]
    const [t1, t2] = [nuevoToken(), nuevoToken()]
    psql(TRIGGER_DORMILON)
    expect(await registrar(u, i1, t1)).toBe(200)
    expect(await registrar(u, i2, t2)).toBe(200)

    const { s1, s2 } = await dosCruzados(
      { actor: u.id, installId: i1, tokenNuevo: t2 },
      { actor: u.id, installId: i2, tokenNuevo: t1 },
    )
    try {
      const abortadas = [s1, s2].filter((s) => s.texto().includes('40P01'))
      const ganadoras = [s1, s2].filter((s) => s.texto().includes('REG|'))
      expect(abortadas).toHaveLength(1)
      expect(ganadoras).toHaveLength(1)
      expect(abortadas[0]?.texto()).toContain('deadlock detected')
    } finally {
      s1.cerrar()
      s2.cerrar()
      psql(QUITAR_TRIGGER)
    }
    const filas = await filasDe([i1, i2], [t1, t2])
    expect(new Set(filas.map((f) => f.token)).size).toBe(filas.length)
    expect(filas.every((f) => f.user_id === u.id)).toBe(true)
    expect(filas.length).toBeGreaterThanOrEqual(1)
  })

  it('dos usuarios que se cruzan los tokens: una aborta y ninguna instalación cambia de dueño', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    const [ia, ib] = [nuevoInstallId(), nuevoInstallId()]
    const [ta, tb] = [nuevoToken(), nuevoToken()]
    psql(TRIGGER_DORMILON)
    expect(await registrar(a, ia, ta)).toBe(200)
    expect(await registrar(b, ib, tb)).toBe(200)

    const { s1, s2 } = await dosCruzados(
      { actor: a.id, installId: ia, tokenNuevo: tb },
      { actor: b.id, installId: ib, tokenNuevo: ta },
    )
    try {
      expect([s1, s2].filter((s) => s.texto().includes('40P01'))).toHaveLength(1)
      expect([s1, s2].filter((s) => s.texto().includes('REG|'))).toHaveLength(1)
    } finally {
      s1.cerrar()
      s2.cerrar()
      psql(QUITAR_TRIGGER)
    }
    const filas = await filasDe([ia, ib], [ta, tb])
    expect(new Set(filas.map((f) => f.token)).size).toBe(filas.length)
    for (const f of filas) {
      expect(f.user_id).toBe(f.install_id === ia ? a.id : b.id)
    }
  })
})

describe('intercambio cruzado simultáneo por la ruta real (CAX-001)', () => {
  it('20 rondas: ningún 500, un token por fila y ninguna instalación cambia de dueño', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    const vistos = new Set<number>()
    for (let ronda = 0; ronda < 20; ronda++) {
      const cruzado = ronda % 2 === 1
      const dueno1 = a
      const dueno2 = cruzado ? b : a
      const [i1, i2] = [nuevoInstallId(), nuevoInstallId()]
      const [t1, t2] = [nuevoToken(), nuevoToken()]
      expect(await registrar(dueno1, i1, t1), `ronda ${ronda} alta 1`).toBe(200)
      expect(await registrar(dueno2, i2, t2), `ronda ${ronda} alta 2`).toBe(200)

      const [r1, r2] = await Promise.all([registrar(dueno1, i1, t2), registrar(dueno2, i2, t1)])
      for (const status of [r1, r2]) {
        vistos.add(status)
        expect([200, 409], `ronda ${ronda}`).toContain(status)
      }
      const filas = await filasDe([i1, i2], [t1, t2])
      expect(new Set(filas.map((f) => f.token)).size, `ronda ${ronda}`).toBe(filas.length)
      for (const f of filas) {
        expect(f.user_id, `ronda ${ronda}`).toBe(f.install_id === i1 ? dueno1.id : dueno2.id)
      }
    }
    expect([...vistos].every((s) => s === 200 || s === 409)).toBe(true)
    // Cada abrazo mortal tarda `deadlock_timeout` (1 s) en detectarse, más los reintentos con espera:
    // 20 rondas no caben en los 15 s por defecto cuando la suite entera carga la base.
  }, 90_000)
})

describe('registro y borrado de cuenta simultáneos (dos sesiones)', () => {
  async function clienteConPerfil(): Promise<Usuario> {
    const u = await crearUsuario()
    const { error } = await db.from('customer_profiles').insert({
      user_id: u.id,
      full_name: 'Vecino MV7a carreras',
      phone: `9${String(Date.now()).slice(-6)}${String(secuencia).padStart(2, '0')}`,
      phone_verified_at: new Date().toISOString(),
    })
    if (error) throw new Error(`crear el perfil falló: ${error.message}`)
    return u
  }

  const borrarSql = (userId: string): string =>
    `select 'DEL|' || (public.delete_customer_account('${userId}')::jsonb ->> 'status');`

  it('el registro llega primero: el borrado espera, y el dispositivo cae por la cascada', async () => {
    const u = await clienteConPerfil()
    const installId = nuevoInstallId()
    const token = nuevoToken()
    const registro = new Sesion()
    const borrado = new Sesion()
    try {
      registro.enviar(`begin;\n${registroSql(u.id, installId, token)}`)
      await registro.esperar('REG|')
      borrado.enviar(`${borrarSql(u.id)}\nselect 'FIN|';`)
      await borrado.noAparece('DEL|', 1500)
      registro.enviar('commit;')
      await borrado.esperar('FIN|')
      expect(borrado.texto()).toContain('DEL|deleted')
    } finally {
      registro.cerrar()
      borrado.cerrar()
    }
    expect(await filasDe([installId], [token])).toHaveLength(0)
  })

  it('el borrado llega primero: el registro espera y falla con account_deleted, sin dejar token', async () => {
    const u = await clienteConPerfil()
    const installId = nuevoInstallId()
    const token = nuevoToken()
    const borrado = new Sesion()
    const registro = new Sesion()
    try {
      borrado.enviar(`begin;\n${borrarSql(u.id)}`)
      await borrado.esperar('DEL|deleted')
      registro.enviar(`${registroSql(u.id, installId, token)}\nselect 'FIN|';`)
      await registro.noAparece('FIN|', 1500)
      borrado.enviar('commit;')
      await registro.esperar('FIN|')
      expect(registro.texto()).toContain('account_deleted')
      expect(registro.texto()).not.toContain('REG|')
    } finally {
      borrado.cerrar()
      registro.cerrar()
    }
    expect(await filasDe([installId], [token])).toHaveLength(0)
    const { data } = await db.from('push_devices').select('id').eq('user_id', u.id)
    expect(data).toHaveLength(0)
  })
})
