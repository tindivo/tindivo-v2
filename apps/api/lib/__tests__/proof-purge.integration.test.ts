/**
 * Migración 0269 + módulo `retention` (D-44, OPS-2): los comprobantes de una cuenta borrada se
 * purgan a los 90 días. Contra la base y el Storage LOCALES, con el caso de uso real.
 *
 *  · 91 días: el archivo ya no existe en Storage, las referencias están a NULL y la cuenta
 *    queda marcada. 89 días: no se toca nada.
 *  · Lo de otros clientes (vivo, borrado sin vencer, y carpetas con un prefijo común) sigue.
 *  · Segunda corrida: no hace nada. `finish_proof_purge` aborta si quedan objetos o no venció.
 *  · Sin la clave `account_deletion` en `app_settings`, nada se purga (falla cerrada).
 *  · Permisos de las tres funciones. Ningún importe, estado ni cargo cambia.
 */
import { execFileSync } from 'node:child_process'
import {
  purgeDeletedAccountProofs,
  SupabaseProofStorage,
  SupabaseRetentionRepository,
} from '@tindivo/backend/retention'
import { createLogger, type LogLevel } from '@tindivo/backend/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupLedgerWorld,
  type LedgerWorld,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient as db } from './helpers/local-db'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CLAVE = 'test-password-12345'
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

interface RpcResult {
  data: unknown
  error: { message: string; code?: string } | null
}
const rpc = (name: string, args: Record<string, unknown>): PromiseLike<RpcResult> =>
  (db as unknown as { rpc(n: string, a: Record<string, unknown>): PromiseLike<RpcResult> }).rpc(
    name,
    args,
  )

/** SQL contra la base local por stdin (los acentos no se corrompen). */
function sql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim()
}

interface Cliente {
  id: string
  orderId: string
  /** Ruta del comprobante que referencia su pedido. */
  proof: string
  /** Todos sus archivos: bucket y ruta. */
  files: { bucket: string; path: string }[]
}

let world: LedgerWorld
const creados: string[] = []
const runId = crypto.randomUUID().slice(0, 8)
const prepared = new Map<string, Cliente>()

async function subir(bucket: string, path: string): Promise<boolean> {
  const { error } = await db.storage.from(bucket).upload(path, PNG, { contentType: 'image/png' })
  return !error
}

async function existe(bucket: string, path: string): Promise<boolean> {
  const { data, error } = await db.storage.from(bucket).download(path)
  return !error && data !== null
}

/** Cliente con un pedido cancelado que referencia su comprobante, y los archivos subidos. */
async function crearCliente(etiqueta: string, withReceipt = false): Promise<Cliente> {
  const { data, error } = await db.auth.admin.createUser({
    email: `purga-${etiqueta}-${runId}@integration.local`,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: `Vecino Purga ${etiqueta}` },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  const id = data.user.id
  creados.push(id)

  const orderId = await seedOrder(world)
  const proof = `${id}/${orderId}/attempt-1-${runId}.png`
  const extra = `${id}/${orderId}/attempt-2-${runId}.png`
  const upd = await db
    .from('orders')
    .update({
      customer_user_id: id,
      status: 'cancelled',
      cancel_reason: 'proof_rejected_final',
      cancelled_at: new Date().toISOString(),
      comprobante_prepago_url: proof,
    })
    .eq('id', orderId)
  if (upd.error) throw new Error(`preparar el pedido falló: ${upd.error.message}`)

  const files = [
    { bucket: 'payment-proofs', path: proof },
    { bucket: 'payment-proofs', path: extra },
  ]
  if (withReceipt) {
    const receipt = `${id}/recibo-${runId}.png`
    if (await subir('receipts', receipt)) {
      files.push({ bucket: 'receipts', path: receipt })
    }
  }
  for (const f of files.filter((x) => x.bucket === 'payment-proofs')) {
    if (!(await subir(f.bucket, f.path))) throw new Error(`no se pudo subir ${f.path}`)
  }
  const cliente = { id, orderId, proof, files }
  prepared.set(etiqueta, cliente)
  return cliente
}

async function borrarCuenta(c: Cliente): Promise<void> {
  const { data, error } = await rpc('delete_customer_account', { p_user_id: c.id })
  if (error) throw new Error(`borrar la cuenta falló: ${error.message}`)
  expect((data as { status: string }).status).toBe('deleted')
}

const envejecer = (c: Cliente, dias: number): void => {
  sql(`update public.users set deleted_at = now() - interval '${dias} days' where id = '${c.id}';`)
}

const referencia = async (orderId: string): Promise<string | null> => {
  const { data, error } = await db
    .from('orders')
    .select('comprobante_prepago_url')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  return data.comprobante_prepago_url
}

const purgada = (c: Cliente): string =>
  sql(`select coalesce(proofs_purged_at::text, 'null') from public.users where id = '${c.id}';`)

const evidencia = (reportId: string): string =>
  sql(`select coalesce(evidence_url, 'null') from public.reports where id = '${reportId}';`)

function correr() {
  const lines: string[] = []
  const logger = createLogger({
    module: 'test',
    sink: { write: (_l: LogLevel, line: string) => void lines.push(line) },
  })
  const summary = purgeDeletedAccountProofs({
    retention: new SupabaseRetentionRepository(() => db),
    storage: new SupabaseProofStorage(() => db),
    logger,
  })
  return { summary, lines }
}

/** Importes, estados y cargos de todo el mundo de fixture, para comparar antes y después. */
function fotoDelDinero(): string {
  const ids = world.orderIds.map((id) => `'${id}'`).join(',')
  return sql(`
    select coalesce(jsonb_agg(to_jsonb(o) - 'comprobante_prepago_url' - 'updated_at' order by o.id), '[]')::text
      from public.orders o where o.id in (${ids});
    select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]')::text
      from public.business_charges c where c.business_id = '${world.businessId}';
    select balance_due::text from public.businesses where id = '${world.businessId}';`)
}

let a: Cliente
let b: Cliente
let c: Cliente
let e: Cliente
let reportA: string
let reportB: string
let decoyPrefijo: string
let decoyIgual: string
let dineroAntes: string
let settingOriginal: string

beforeAll(async () => {
  world = await seedLedgerWorld()
  a = await crearCliente('a', true)
  b = await crearCliente('b')
  c = await crearCliente('c')
  e = await crearCliente('e')

  // Carpetas ajenas con un prefijo común con el id de A: no son suyas.
  decoyPrefijo = `${a.id.slice(0, 8)}/decoy-${runId}.png`
  decoyIgual = `${a.id}-otro/decoy-${runId}.png`
  expect(await subir('payment-proofs', decoyPrefijo)).toBe(true)
  expect(await subir('payment-proofs', decoyIgual)).toBe(true)

  await borrarCuenta(a)
  await borrarCuenta(c)
  await borrarCuenta(e)

  // Apelaciones: la de A apunta a su carpeta (así las crea `create_appeal_report`); la de B, a la suya.
  const mk = async (cl: Cliente) => {
    const { data, error } = await db
      .from('reports')
      .insert({
        type: 'rejected_proof_disputed',
        status: 'resolved',
        appeal_status: 'rejected',
        order_id: cl.orderId,
        customer_user_id: cl.id,
        evidence_url: cl.proof,
      })
      .select('id')
      .single()
    if (error) throw new Error(`crear el reporte falló: ${error.message}`)
    return data.id
  }
  reportA = await mk(a)
  reportB = await mk(b)

  settingOriginal = sql(
    `select value::text from public.app_settings where key = 'account_deletion';`,
  )
  dineroAntes = fotoDelDinero()
})

afterAll(async () => {
  sql(
    `insert into public.app_settings (key, value) values ('account_deletion', '{"proofRetentionDays": 90}')
     on conflict (key) do nothing;`,
  )
  const todos = [...prepared.values()]
  for (const cl of todos) {
    await db.storage.from('payment-proofs').remove(cl.files.map((f) => f.path))
    await db.storage.from('receipts').remove(cl.files.map((f) => f.path))
  }
  await db.storage.from('payment-proofs').remove([decoyPrefijo, decoyIgual])
  if (world) {
    await db.from('reports').delete().in('order_id', world.orderIds)
    await cleanupLedgerWorld(world)
  }
  for (const id of creados) {
    await db.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
})

describe('purga de comprobantes de cuentas borradas (0269)', () => {
  it('la clave de ajustes sembrada es 90 días', () => {
    expect(JSON.parse(settingOriginal)).toEqual({ proofRetentionDays: 90 })
  })

  it('a los 89 días no se toca nada', async () => {
    envejecer(a, 89)
    envejecer(c, 10)
    const due = await rpc('list_proof_purge_due', { p_limit: 100 })
    expect((due.data as { user_id: string }[]).map((r) => r.user_id)).not.toContain(a.id)

    const { summary } = correr()
    expect((await summary).failed).toBe(0)
    for (const f of a.files) expect(await existe(f.bucket, f.path)).toBe(true)
    expect(await referencia(a.orderId)).toBe(a.proof)
    expect(evidencia(reportA)).toBe(a.proof)
    expect(purgada(a)).toBe('null')
  })

  it('finish_proof_purge dice not_due si no venció o la cuenta no está borrada', async () => {
    const aun = await rpc('finish_proof_purge', { p_user_id: a.id })
    expect(aun.error?.code).toBe('P0001')
    expect(aun.error?.message).toBe('not_due')
    const viva = await rpc('finish_proof_purge', { p_user_id: b.id })
    expect(viva.error?.message).toBe('not_due')
    expect(purgada(a)).toBe('null')
    expect(purgada(b)).toBe('null')
  })

  it('finish_proof_purge aborta si quedan objetos en Storage (cuenta vencida)', async () => {
    envejecer(e, 91)
    const r = await rpc('finish_proof_purge', { p_user_id: e.id })
    expect(r.error?.code).toBe('P0001')
    expect(r.error?.message).toBe('proof_objects_remain')
    expect(await referencia(e.orderId)).toBe(e.proof)
    expect(purgada(e)).toBe('null')
  })

  it('sin la clave account_deletion no se purga nada (falla cerrada)', async () => {
    sql(`delete from public.app_settings where key = 'account_deletion';`)
    try {
      envejecer(a, 91)
      const due = await rpc('list_proof_purge_due', { p_limit: 100 })
      expect(due.data).toEqual([])
      const { summary } = correr()
      expect(await summary).toMatchObject({ accounts: 0, objects: 0, rows: 0 })
      for (const f of a.files) expect(await existe(f.bucket, f.path)).toBe(true)
      expect(await referencia(a.orderId)).toBe(a.proof)
      const fin = await rpc('finish_proof_purge', { p_user_id: a.id })
      expect(fin.error?.message).toBe('not_due')
    } finally {
      sql(
        `insert into public.app_settings (key, value) values ('account_deletion', '${settingOriginal}'::jsonb)
         on conflict (key) do nothing;`,
      )
    }
  })

  it('un valor que no es un entero >= 1 tampoco purga', async () => {
    for (const malo of ['0', '-5', '1.5', '"90"', 'null', '{}']) {
      sql(
        `update public.app_settings set value = jsonb_build_object('proofRetentionDays', '${malo}'::jsonb)
          where key = 'account_deletion';`,
      )
      const due = await rpc('list_proof_purge_due', { p_limit: 100 })
      expect(due.data, `valor ${malo}`).toEqual([])
    }
    sql(
      `update public.app_settings set value = '${settingOriginal}'::jsonb where key = 'account_deletion';`,
    )
  })

  it('a los 91 días borra los archivos y las referencias, y deja lo ajeno', async () => {
    envejecer(a, 91)
    const { summary, lines } = correr()
    const result = await summary
    expect(result.failed).toBe(0)
    expect(result.accounts).toBeGreaterThanOrEqual(2) // A y E
    expect(result.objects).toBeGreaterThanOrEqual(a.files.length + e.files.length)

    // Los archivos de A ya no existen en Storage (ni payment-proofs ni receipts).
    for (const f of a.files) expect(await existe(f.bucket, f.path)).toBe(false)
    expect(
      sql(
        `select count(*) from storage.objects where bucket_id in ('payment-proofs','receipts')
          and (storage.foldername(name))[1] = '${a.id}';`,
      ),
    ).toBe('0')

    // Referencias a NULL y cuenta marcada.
    expect(await referencia(a.orderId)).toBeNull()
    expect(evidencia(reportA)).toBe('null')
    expect(purgada(a)).not.toBe('null')

    // Otros clientes: el vivo, el borrado sin vencer y las carpetas con prefijo común.
    for (const otro of [b, c]) {
      for (const f of otro.files) expect(await existe(f.bucket, f.path)).toBe(true)
      expect(await referencia(otro.orderId)).toBe(otro.proof)
      expect(purgada(otro)).toBe('null')
    }
    expect(evidencia(reportB)).toBe(b.proof)
    expect(await existe('payment-proofs', decoyPrefijo)).toBe(true)
    expect(await existe('payment-proofs', decoyIgual)).toBe(true)

    // El log no lleva ids ni rutas.
    const log = lines.join('\n')
    expect(log).not.toContain(a.id)
    expect(log).not.toContain('attempt-')
  })

  it('E (vencida con archivos) también quedó purgada', async () => {
    for (const f of e.files) expect(await existe(f.bucket, f.path)).toBe(false)
    expect(await referencia(e.orderId)).toBeNull()
    expect(purgada(e)).not.toBe('null')
  })

  it('la segunda corrida no hace nada y finish_proof_purge es idempotente', async () => {
    const { summary } = correr()
    expect(await summary).toEqual({ accounts: 0, objects: 0, rows: 0, failed: 0 })
    const fin = await rpc('finish_proof_purge', { p_user_id: a.id })
    expect(fin.error).toBeNull()
    expect(fin.data).toEqual({ status: 'already_purged', orders: 0, reports: 0 })
  })

  it('ningún importe, estado ni cargo cambió', () => {
    expect(fotoDelDinero()).toBe(dineroAntes)
  })

  it('las tres funciones son SECURITY DEFINER, con search_path vacío y solo service_role', () => {
    const filas = sql(`
      select p.proname || '|' || p.prosecdef || '|' || (p.proconfig = array['search_path=""']) || '|' ||
             has_function_privilege('anon', p.oid, 'execute') || '|' ||
             has_function_privilege('authenticated', p.oid, 'execute') || '|' ||
             has_function_privilege('public', p.oid, 'execute') || '|' ||
             has_function_privilege('service_role', p.oid, 'execute')
        from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public'
         and p.proname in ('list_proof_purge_due', 'list_user_proof_objects', 'finish_proof_purge')
       order by p.proname;`).split('\n')
    expect(filas).toEqual([
      'finish_proof_purge|true|true|false|false|false|true',
      'list_proof_purge_due|true|true|false|false|false|true',
      'list_user_proof_objects|true|true|false|false|false|true',
    ])
  })

  it('el comprobante de un pedido de una cuenta viva sigue siendo inmutable', async () => {
    const r = await db.from('orders').update({ comprobante_prepago_url: null }).eq('id', b.orderId)
    expect(r.error?.code).toBe('P0001')
    expect(await referencia(b.orderId)).toBe(b.proof)
  })
})

describe('CAX-001 · solo se anulan las referencias canónicas y propias', () => {
  it('con una referencia ajena o una URL completa aborta sin tocar nada y la cuenta queda pendiente', async () => {
    const f = await crearCliente('f')
    // Otros dos pedidos del mismo cliente: uno apunta a la carpeta de otro y otro es una URL completa.
    const ajena = `${b.id}/${b.orderId}/attempt-9-${runId}.png`
    const url = `https://ejemplo.invalid/storage/v1/object/payment-proofs/${f.id}/x.png`
    const refs: string[] = []
    for (const ref of [ajena, url]) {
      const orderId = await seedOrder(world)
      const upd = await db
        .from('orders')
        .update({
          customer_user_id: f.id,
          status: 'cancelled',
          cancel_reason: 'proof_rejected_final',
          cancelled_at: new Date().toISOString(),
          comprobante_prepago_url: ref,
        })
        .eq('id', orderId)
      if (upd.error) throw new Error(upd.error.message)
      refs.push(orderId)
    }
    await borrarCuenta(f)
    envejecer(f, 91)

    const r = await rpc('finish_proof_purge', { p_user_id: f.id })
    expect(r.error?.code).toBe('P0001')
    expect(r.error?.message).toBe('non_canonical_refs')
    // Nada se anuló, ni siquiera la canónica propia; la marca no se puso.
    expect(await referencia(f.orderId)).toBe(f.proof)
    expect(await referencia(refs[0] as string)).toBe(ajena)
    expect(await referencia(refs[1] as string)).toBe(url)
    expect(purgada(f)).toBe('null')

    // El caso de uso lo registra (solo el tipo) y la cuenta sigue pendiente.
    const { summary, lines } = correr()
    const result = await summary
    expect(result.failed).toBeGreaterThanOrEqual(1)
    expect(purgada(f)).toBe('null')
    expect(lines.join('\n')).toContain('non_canonical_refs')
    expect(lines.join('\n')).not.toContain(f.id)

    // Una persona resuelve las referencias raras: la siguiente corrida cierra la cuenta.
    sql(`begin;
      select set_config('tindivo.deleting_account', '${f.id}', true);
      update public.orders set comprobante_prepago_url = null
       where customer_user_id = '${f.id}' and comprobante_prepago_url is not null;
      commit;`)
    expect((await correr().summary).failed).toBe(0)
    expect(purgada(f)).not.toBe('null')
  })

  it('las referencias canónicas y propias de un cliente normal sí se anulan (caso normal)', async () => {
    expect(await referencia(a.orderId)).toBeNull()
    expect(purgada(a)).not.toBe('null')
  })
})
