import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from '../../../shared'
import {
  type DueAccount,
  type DueCursor,
  type ProofObject,
  type ProofStorage,
  PurgeAbortedError,
  type PurgeAbortReason,
  type PurgeOutcome,
  type RetentionRepository,
} from './ports'
import { purgeDeletedAccountProofs } from './purge-deleted-account-proofs'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

interface Fakes {
  retention: RetentionRepository
  storage: ProofStorage
  removed: { bucket: string; paths: string[] }[]
  finished: string[]
  lines: string[]
}

function build(options: {
  objects: Record<string, ProofObject[]>
  failRemoveFor?: (bucket: string, paths: string[]) => boolean
  failFinishFor?: (userId: string) => boolean
  precheckFor?: (userId: string) => 'ok' | PurgeAbortReason
}): Fakes & { pages: (DueCursor | undefined)[]; listed: string[] } {
  const pages: (DueCursor | undefined)[] = []
  const listed: string[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const finished: string[] = []
  const lines: string[] = []
  const done = new Set<string>()
  const retention: RetentionRepository = {
    // Orden estable `(deletedAt, userId)` con cursor, como la función de la base.
    listDueAccounts: async (limit, after) => {
      pages.push(after)
      const all: DueAccount[] = Object.keys(options.objects)
        .map((userId, i) => ({
          userId,
          deletedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
        }))
        .filter((r) => !done.has(r.userId))
        .sort((x, y) => x.deletedAt.localeCompare(y.deletedAt) || x.userId.localeCompare(y.userId))
      return all
        .filter(
          (r) => !after || `${r.deletedAt}|${r.userId}` > `${after.deletedAt}|${after.userId}`,
        )
        .slice(0, limit)
    },
    precheck: async (userId) => options.precheckFor?.(userId) ?? 'ok',
    listProofObjects: async (userId) => {
      listed.push(userId)
      return options.objects[userId] ?? []
    },
    finishPurge: async (userId): Promise<PurgeOutcome> => {
      if (options.failFinishFor?.(userId)) throw new PurgeAbortedError('non_canonical_refs')
      finished.push(userId)
      done.add(userId)
      return { status: 'purged', orders: 1, reports: 1 }
    },
  }
  const storage: ProofStorage = {
    remove: async (bucket, paths) => {
      if (options.failRemoveFor?.(bucket, paths)) throw new Error(`falló ${paths[0]}`)
      removed.push({ bucket, paths })
    },
  }
  return { retention, storage, removed, finished, lines, pages, listed }
}

function loggerInto(lines: string[]) {
  return createLogger({
    module: 'test',
    sink: { write: (_level: LogLevel, line: string) => void lines.push(line) },
  })
}

const objectsOf = (userId: string, n: number, bucket = 'payment-proofs'): ProofObject[] =>
  Array.from({ length: n }, (_, i) => ({ bucket, path: `${userId}/${i}/attempt.jpg` }))

describe('purgeDeletedAccountProofs', () => {
  it('borra los archivos, luego cierra la purga y cuenta cuentas, objetos y filas', async () => {
    const f = build({
      objects: {
        [USER_A]: [...objectsOf(USER_A, 2), ...objectsOf(USER_A, 1, 'receipts')],
      },
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(summary).toEqual({ accounts: 1, objects: 3, rows: 2, failed: 0 })
    expect(f.removed.map((r) => r.bucket).sort()).toEqual(['payment-proofs', 'receipts'])
    expect(f.finished).toEqual([USER_A])
  })

  it('no cierra la purga si el borrado en Storage falla', async () => {
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 2) },
      failRemoveFor: () => true,
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.finished).toEqual([])
    expect(summary).toEqual({ accounts: 0, objects: 0, rows: 0, failed: 1 })
  })

  it('si una cuenta falla, sigue con la siguiente', async () => {
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 1), [USER_B]: objectsOf(USER_B, 1) },
      failRemoveFor: (_bucket, paths) => paths.some((p) => p.startsWith(USER_A)),
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.finished).toEqual([USER_B])
    expect(summary).toEqual({ accounts: 1, objects: 1, rows: 2, failed: 1 })
  })

  it('avanza por cursor: 100 cuentas que siempre fallan no tapan a la 101', async () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    )
    const objects = Object.fromEntries(ids.map((id) => [id, objectsOf(id, 1)]))
    // Con 100 fallos seguidos, un Storage que falla para las 100 primeras.
    const fallan = new Set(ids.slice(0, 100))
    const f = build({
      objects,
      failRemoveFor: (_bucket, paths) => fallan.has((paths[0] as string).split('/')[0] as string),
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.finished).toEqual([ids[100]])
    expect(summary).toEqual({ accounts: 1, objects: 1, rows: 2, failed: 100 })
    // La segunda página parte del cursor de la última cuenta de la primera.
    expect(f.pages[0]).toBeUndefined()
    expect(f.pages[1]?.userId).toBe(ids[99])
  })

  it('respeta el presupuesto de 10 lotes por corrida', async () => {
    const ids = Array.from(
      { length: 1050 },
      (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    )
    const f = build({ objects: Object.fromEntries(ids.map((id) => [id, []])) })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(summary.accounts).toBe(1000)
    expect(f.pages).toHaveLength(10)
  })

  it('un aborto de la base al cerrar (por ejemplo non_canonical_refs) deja la cuenta pendiente y sigue', async () => {
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 1), [USER_B]: objectsOf(USER_B, 1) },
      failFinishFor: (id) => id === USER_A,
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(summary).toMatchObject({ accounts: 1, failed: 1 })
    expect(f.finished).toEqual([USER_B])
    expect(f.lines.join(String.fromCharCode(10))).toContain('non_canonical_refs')
    expect(f.lines.join(String.fromCharCode(10))).not.toContain(USER_A)
  })

  it('si el precheck no da ok, no lista ni borra nada de esa cuenta y sigue con la siguiente', async () => {
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 2), [USER_B]: objectsOf(USER_B, 1) },
      precheckFor: (id) => (id === USER_A ? 'non_canonical_refs' : 'ok'),
    })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.listed).toEqual([USER_B])
    expect(f.removed.flatMap((r) => r.paths).some((path) => path.startsWith(USER_A))).toBe(false)
    expect(f.finished).toEqual([USER_B])
    expect(summary).toMatchObject({ accounts: 1, failed: 1 })
    const log = f.lines.join(String.fromCharCode(10))
    expect(log).toContain('non_canonical_refs')
    expect(log).not.toContain(USER_A)
  })

  it('parte el borrado en bloques de 100 archivos por bucket', async () => {
    const f = build({ objects: { [USER_A]: objectsOf(USER_A, 250) } })
    await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.removed.map((r) => r.paths.length)).toEqual([100, 100, 50])
  })

  it('una cuenta sin archivos también se cierra', async () => {
    const f = build({ objects: { [USER_A]: [] } })
    const summary = await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(f.removed).toEqual([])
    expect(summary.accounts).toBe(1)
  })

  it('no registra ids, rutas ni el mensaje del error', async () => {
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 1) },
      failRemoveFor: () => true,
    })
    await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    const log = f.lines.join('\n')
    expect(log).toContain('proof_purge_account_failed')
    expect(log).not.toContain(USER_A)
    expect(log).not.toContain('attempt.jpg')
    expect(log).not.toContain('falló')
  })
})
