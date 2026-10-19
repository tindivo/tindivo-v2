import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from '../../../shared'
import type { ProofObject, ProofStorage, PurgeOutcome, RetentionRepository } from './ports'
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
  due?: () => string[]
}): Fakes {
  const removed: { bucket: string; paths: string[] }[] = []
  const finished: string[] = []
  const lines: string[] = []
  const done = new Set<string>()
  const retention: RetentionRepository = {
    listDueAccounts: async () =>
      options.due ? options.due() : Object.keys(options.objects).filter((id) => !done.has(id)),
    listProofObjects: async (userId) => options.objects[userId] ?? [],
    finishPurge: async (userId): Promise<PurgeOutcome> => {
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
  return { retention, storage, removed, finished, lines }
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

  it('una cuenta que falla no se vuelve a pedir en bucle dentro de la misma corrida', async () => {
    let calls = 0
    const f = build({
      objects: { [USER_A]: objectsOf(USER_A, 1) },
      failRemoveFor: () => true,
      due: () => {
        calls += 1
        return [USER_A]
      },
    })
    await purgeDeletedAccountProofs({
      retention: f.retention,
      storage: f.storage,
      logger: loggerInto(f.lines),
    })
    expect(calls).toBe(2)
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
