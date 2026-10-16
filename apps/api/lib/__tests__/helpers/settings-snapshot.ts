/**
 * Respaldo y restauración de filas de una base COMPARTIDA para tests de integración.
 *
 * El problema que resuelve (CAX-003): un test que quita o cambia filas de configuración
 * (`push_dispatch`, `push_claim_since`, `ops_alert_throttle`) debe devolverlas tal cual. Si el
 * `beforeAll` falla ANTES de respaldar una fila, el `afterAll` no puede interpretar «no la respaldé»
 * como «no existía» y borrarla: borraría configuración real de otra sesión.
 *
 * Por eso cada fila tiene uno de tres estados, explícitos:
 *  - `unbacked`: no se pudo leer. NUNCA se toca (ni se modifica ni se restaura).
 *  - `absent`:   se leyó y no existía. Al restaurar, si el test la creó, se borra.
 *  - `present`:  se leyó y existía. Al restaurar se devuelve con TODAS sus columnas (valor y
 *                `updated_at` incluidos) y se comprueba leyéndola de nuevo.
 *
 * Sin base ni red: el almacenamiento entra por la interfaz `RowStore` (el test unitario usa uno falso).
 */

export type Row = Record<string, unknown>

export type StoreResult<T> = { data: T; error: null } | { data: null; error: string }

export interface RowStore {
  /** Lee la fila `id`; `data: null` sin error significa que no existe. */
  read(id: string): Promise<StoreResult<Row | null>>
  /** Borra la fila `id` (borrar una ausente no es un error). */
  remove(id: string): Promise<{ error: string | null }>
  /** Escribe la fila completa (todas sus columnas) tal como se respaldó. */
  write(id: string, row: Row): Promise<{ error: string | null }>
}

export type SnapshotState =
  | { kind: 'unbacked' }
  | { kind: 'absent' }
  | { kind: 'present'; row: Row }

/** Serialización estable (claves ordenadas) para comparar filas sin depender del orden de columnas. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

const sameRow = (a: Row | null, b: Row | null): boolean => stable(a) === stable(b)

export class SettingsSnapshot {
  private readonly states = new Map<string, SnapshotState>()

  constructor(
    private readonly store: RowStore,
    private readonly ids: readonly string[],
  ) {
    for (const id of ids) this.states.set(id, { kind: 'unbacked' })
  }

  state(id: string): SnapshotState {
    return this.states.get(id) ?? { kind: 'unbacked' }
  }

  /** Lee y respalda cada fila. Una lectura fallida deja esa fila `unbacked` y aborta. */
  async capture(): Promise<void> {
    for (const id of this.ids) {
      const res = await this.store.read(id)
      if (res.error !== null) {
        this.states.set(id, { kind: 'unbacked' })
        throw new Error(`No se pudo leer «${id}» para respaldarla: ${res.error}`)
      }
      this.states.set(
        id,
        res.data === null ? { kind: 'absent' } : { kind: 'present', row: res.data },
      )
    }
  }

  /** Quita una fila respaldada. Sin respaldo, NO toca nada y falla. */
  async remove(id: string): Promise<void> {
    if (this.state(id).kind === 'unbacked') {
      throw new Error(`«${id}» no está respaldada: no se modifica.`)
    }
    const res = await this.store.remove(id)
    if (res.error !== null) throw new Error(`No se pudo quitar «${id}»: ${res.error}`)
  }

  /**
   * Devuelve cada fila respaldada a su estado original, una a una e independientes. Al final lanza
   * UN error que lista las que fallaron (las `unbacked` se saltan: no se tocaron).
   */
  async restoreAll(): Promise<void> {
    const failures: string[] = []
    for (const id of this.ids) {
      try {
        await this.restoreOne(id)
      } catch (e) {
        failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `NO SE RESTAURARON ${failures.length} fila(s) de la base compartida; revísalas a mano:\n- ${failures.join('\n- ')}`,
      )
    }
  }

  private async restoreOne(id: string): Promise<void> {
    const st = this.state(id)
    if (st.kind === 'unbacked') return
    const want: Row | null = st.kind === 'present' ? st.row : null

    const now = await this.store.read(id)
    if (now.error !== null) throw new Error(`no se pudo leer antes de restaurar: ${now.error}`)
    if (sameRow(now.data, want)) return

    if (st.kind === 'present') {
      // Borrar y reescribir la fila entera: ni un upsert ni un UPDATE pueden devolver `updated_at` exacto.
      const del = await this.store.remove(id)
      if (del.error !== null) throw new Error(`no se pudo quitar la fila cambiada: ${del.error}`)
      const wr = await this.store.write(id, st.row)
      if (wr.error !== null) throw new Error(`no se pudo reescribir: ${wr.error}`)
    } else {
      const del = await this.store.remove(id)
      if (del.error !== null)
        throw new Error(`no se pudo borrar la fila creada por el test: ${del.error}`)
    }

    const after = await this.store.read(id)
    if (after.error !== null)
      throw new Error(`no se pudo comprobar la restauración: ${after.error}`)
    if (!sameRow(after.data, want)) throw new Error('la fila no quedó como estaba tras restaurarla')
  }
}

/**
 * Prepara el aislamiento en ESTE orden: 1) todas las precondiciones (entorno, función alcanzable),
 * sin leer ni tocar nada; 2) respaldo de todas las filas; 3) quitar las indicadas. Si algo falla, lanza
 * y el llamador debe seguir llamando a `restoreAll()` en su `afterAll` (que respeta los estados).
 */
export async function prepareIsolation(opts: {
  preconditions: ReadonlyArray<() => void | Promise<void>>
  snapshot: SettingsSnapshot
  removeIds: readonly string[]
}): Promise<void> {
  for (const check of opts.preconditions) await check()
  await opts.snapshot.capture()
  for (const id of opts.removeIds) await opts.snapshot.remove(id)
}
