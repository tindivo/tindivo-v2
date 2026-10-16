/**
 * Unitario (sin base, sin red) del respaldo/restauración de filas compartidas (CAX-003).
 * Un almacenamiento simulado deja inyectar fallos por operación y por fila.
 */
import { describe, expect, it } from 'vitest'
import {
  prepareIsolation,
  type Row,
  type RowStore,
  SettingsSnapshot,
  type StoreResult,
} from './helpers/settings-snapshot'

type Op = 'read' | 'remove' | 'write'

class FakeStore implements RowStore {
  readonly rows = new Map<string, Row>()
  readonly calls: string[] = []
  private readonly failing = new Set<string>()
  /** Si se fija, `write` guarda esta fila en vez de la pedida (simula una escritura que no cuaja). */
  distortWrite: ((row: Row) => Row) | null = null

  constructor(initial: Record<string, Row> = {}) {
    for (const [id, row] of Object.entries(initial)) this.rows.set(id, row)
  }

  failOn(op: Op, id: string): this {
    this.failing.add(`${op}:${id}`)
    return this
  }

  async read(id: string): Promise<StoreResult<Row | null>> {
    this.calls.push(`read:${id}`)
    if (this.failing.has(`read:${id}`)) return { data: null, error: 'lectura caída' }
    return { data: this.rows.get(id) ?? null, error: null }
  }

  async remove(id: string): Promise<{ error: string | null }> {
    this.calls.push(`remove:${id}`)
    if (this.failing.has(`remove:${id}`)) return { error: 'borrado caído' }
    this.rows.delete(id)
    return { error: null }
  }

  async write(id: string, row: Row): Promise<{ error: string | null }> {
    this.calls.push(`write:${id}`)
    if (this.failing.has(`write:${id}`)) return { error: 'escritura caída' }
    this.rows.set(id, this.distortWrite ? this.distortWrite(row) : row)
    return { error: null }
  }

  mutations(): string[] {
    return this.calls.filter((c) => !c.startsWith('read:'))
  }
}

const DISPATCH: Row = {
  key: 'push_dispatch',
  value: { url: 'http://x' },
  updated_at: '2026-01-01T00:00:00+00',
}
const CUT: Row = {
  key: 'push_claim_since',
  value: '2026-02-02T00:00:00Z',
  updated_at: '2026-02-02T00:00:01+00',
}
const IDS = ['push_dispatch', 'push_claim_since', 'throttle'] as const

describe('SettingsSnapshot · respaldo y restauración', () => {
  it('secreto ausente: falla la precondición y no se lee ni se modifica NADA', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH, push_claim_since: CUT })
    const snap = new SettingsSnapshot(store, IDS)
    await expect(
      prepareIsolation({
        preconditions: [
          () => {
            throw new Error('Falta el secreto')
          },
        ],
        snapshot: snap,
        removeIds: ['push_dispatch'],
      }),
    ).rejects.toThrow('Falta el secreto')
    expect(store.calls).toEqual([])
    // El afterAll corre igual: con todas las filas sin respaldar no toca nada, ni las existentes ni las ausentes.
    await snap.restoreAll()
    expect(store.calls).toEqual([])
    expect(store.rows.get('push_dispatch')).toEqual(DISPATCH)
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
  })

  for (const failing of IDS) {
    it(`fallo al leer «${failing}»: esa fila queda intacta y sin respaldar, y nada se quita`, async () => {
      const store = new FakeStore({
        push_dispatch: DISPATCH,
        push_claim_since: CUT,
        throttle: { kind: 't' },
      })
      store.failOn('read', failing)
      const snap = new SettingsSnapshot(store, IDS)
      await expect(
        prepareIsolation({ preconditions: [], snapshot: snap, removeIds: ['push_dispatch'] }),
      ).rejects.toThrow(failing)
      expect(snap.state(failing).kind).toBe('unbacked')
      expect(store.mutations()).toEqual([]) // el respaldo termina antes de quitar nada
      await snap.restoreAll() // el afterAll corre igual y no modifica nada
      expect(store.mutations()).toEqual([])
      expect(store.rows.get('push_dispatch')).toEqual(DISPATCH)
      expect(store.rows.get('push_claim_since')).toEqual(CUT)
      expect(store.rows.get('throttle')).toEqual({ kind: 't' })
    })
  }

  it('«no respaldada» NO es «ausente»: una fila existente sin respaldo sobrevive al afterAll', async () => {
    const store = new FakeStore({ push_claim_since: CUT }).failOn('read', 'push_claim_since')
    const snap = new SettingsSnapshot(store, ['push_claim_since'])
    await expect(snap.capture()).rejects.toThrow()
    await snap.restoreAll()
    expect(store.calls).toEqual(['read:push_claim_since']) // solo la lectura fallida; ni un borrado
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
    await expect(snap.remove('push_claim_since')).rejects.toThrow('no está respaldada')
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
  })

  it('fallo parcial en la preparación: las filas existentes vuelven con su valor y su fecha exactos', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH, push_claim_since: CUT })
    store.failOn('remove', 'push_claim_since')
    const snap = new SettingsSnapshot(store, IDS)
    await expect(
      prepareIsolation({
        preconditions: [],
        snapshot: snap,
        removeIds: ['push_dispatch', 'push_claim_since'],
      }),
    ).rejects.toThrow('push_claim_since')
    // push_dispatch ya se había quitado; push_claim_since sigue ahí.
    expect(store.rows.has('push_dispatch')).toBe(false)
    // El test creó además una fila que no existía antes.
    store.rows.set('throttle', { kind: 'otp', last_sent_at: 'x' })
    expect(snap.state('push_dispatch')).toEqual({ kind: 'present', row: DISPATCH })
    await snap.restoreAll()
    expect(store.rows.get('push_dispatch')).toEqual(DISPATCH)
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
    expect(store.rows.has('throttle')).toBe(false)
  })

  it('una fila respaldada-presente que el test cambió se restaura con valor y updated_at exactos', async () => {
    const store = new FakeStore({ push_claim_since: CUT })
    const snap = new SettingsSnapshot(store, ['push_claim_since'])
    await snap.capture()
    store.rows.set('push_claim_since', {
      ...CUT,
      value: 'otro',
      updated_at: '2030-01-01T00:00:00+00',
    })
    await snap.restoreAll()
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
  })

  it('una fila que no estaba y el test creó se borra; una que no cambió no se toca', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH })
    const snap = new SettingsSnapshot(store, ['push_dispatch', 'push_claim_since'])
    await snap.capture()
    store.rows.set('push_claim_since', CUT)
    store.calls.length = 0
    await snap.restoreAll()
    expect(store.rows.has('push_claim_since')).toBe(false)
    expect(store.mutations()).toEqual(['remove:push_claim_since'])
  })

  it('fallo al restaurar una fila: las demás se restauran y el error es visible y la lista', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH, push_claim_since: CUT })
    const snap = new SettingsSnapshot(store, IDS)
    await snap.capture()
    store.rows.delete('push_dispatch')
    store.rows.set('push_claim_since', { ...CUT, value: 'otro' })
    store.rows.set('throttle', { kind: 'creada' })
    store.failOn('write', 'push_dispatch')
    await expect(snap.restoreAll()).rejects.toThrow(/NO SE RESTAURARON 1 fila.*push_dispatch/s)
    expect(store.rows.get('push_claim_since')).toEqual(CUT)
    expect(store.rows.has('throttle')).toBe(false)
  })

  it('fallo en varias filas: el error lista todas', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH, push_claim_since: CUT })
    const snap = new SettingsSnapshot(store, IDS)
    await snap.capture()
    store.rows.delete('push_dispatch')
    store.rows.set('push_claim_since', { ...CUT, value: 'otro' })
    store.failOn('write', 'push_dispatch').failOn('write', 'push_claim_since')
    const err = await snap.restoreAll().then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )
    expect(err).toContain('NO SE RESTAURARON 2')
    expect(err).toContain('push_dispatch')
    expect(err).toContain('push_claim_since')
  })

  it('una restauración que no deja la fila como estaba se reporta (se comprueba releyendo)', async () => {
    const store = new FakeStore({ push_dispatch: DISPATCH })
    const snap = new SettingsSnapshot(store, ['push_dispatch'])
    await snap.capture()
    store.rows.delete('push_dispatch')
    store.distortWrite = (row) => ({ ...row, updated_at: 'distinta' })
    await expect(snap.restoreAll()).rejects.toThrow('no quedó como estaba')
  })
})
