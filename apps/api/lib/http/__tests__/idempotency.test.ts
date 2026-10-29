import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import { CreationRecordReadError, findStoredCreation, readCreationRecord } from '../idempotency'

type Resultado = { data: unknown; error: unknown }

/** Cliente falso: cada tabla responde lo que se le diga y se anota cuáles se consultaron. */
function clienteFalso(respuestas: Record<string, Resultado>) {
  const consultadas: string[] = []
  const client = {
    from(tabla: string) {
      consultadas.push(tabla)
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => respuestas[tabla],
      }
      return builder
    },
  } as unknown as TypedSupabaseClient
  return { client, consultadas }
}

const ARGS = {
  userId: '11111111-1111-4111-8111-111111111111',
  scope: 'create_order' as const,
  key: '22222222-2222-4222-8222-222222222222',
}
const FALLO = { data: null, error: { code: '57014', message: 'timeout del proveedor' } }
const SIN_FILA = { data: null, error: null }
const futuro = () => new Date(Date.now() + 3_600_000).toISOString()
const pasado = () => new Date(Date.now() - 3_600_000).toISOString()
const filaNueva = (expires_at: string) => ({
  data: { request_hash: 'h', response: { id: 'x' }, resource_id: null, expires_at },
  error: null,
})

describe('readCreationRecord · un fallo de lectura no es «no hay clave»', () => {
  it('(a) la consulta nueva falla: lanza y no consulta la legada', async () => {
    const { client, consultadas } = clienteFalso({
      creation_idempotency: FALLO,
      idempotency_keys: SIN_FILA,
    })
    const err = await readCreationRecord(client, ARGS).catch((e) => e)
    expect(err).toBeInstanceOf(CreationRecordReadError)
    expect(err.cause).toBe(FALLO.error)
    expect(err.message).not.toContain('timeout del proveedor')
    expect(consultadas).toEqual(['creation_idempotency'])
  })

  it('(b) la nueva no trae fila y la legada falla: lanza', async () => {
    const { client } = clienteFalso({ creation_idempotency: SIN_FILA, idempotency_keys: FALLO })
    await expect(readCreationRecord(client, ARGS)).rejects.toBeInstanceOf(CreationRecordReadError)
  })

  it('(c) la nueva trae una fila vencida y la legada falla: lanza', async () => {
    const { client } = clienteFalso({
      creation_idempotency: filaNueva(pasado()),
      idempotency_keys: FALLO,
    })
    await expect(readCreationRecord(client, ARGS)).rejects.toBeInstanceOf(CreationRecordReadError)
  })

  it('(d) las dos fallan: lanza', async () => {
    const { client } = clienteFalso({ creation_idempotency: FALLO, idempotency_keys: FALLO })
    await expect(readCreationRecord(client, ARGS)).rejects.toBeInstanceOf(CreationRecordReadError)
  })

  it('(e) la nueva vigente se devuelve sin consultar la legada', async () => {
    const { client, consultadas } = clienteFalso({
      creation_idempotency: filaNueva(futuro()),
      idempotency_keys: FALLO,
    })
    await expect(readCreationRecord(client, ARGS)).resolves.toMatchObject({
      state: 'completed',
      requestHash: 'h',
      response: { id: 'x' },
    })
    expect(consultadas).toEqual(['creation_idempotency'])
  })

  it('(f) las dos sin fila y sin error: null', async () => {
    const { client, consultadas } = clienteFalso({
      creation_idempotency: SIN_FILA,
      idempotency_keys: SIN_FILA,
    })
    await expect(readCreationRecord(client, ARGS)).resolves.toBeNull()
    expect(consultadas).toEqual(['creation_idempotency', 'idempotency_keys'])
  })
})

describe('findStoredCreation · la incertidumbre se propaga', () => {
  it('(g) un fallo de lectura no se vuelve null (crear a ciegas)', async () => {
    const { client } = clienteFalso({ creation_idempotency: SIN_FILA, idempotency_keys: FALLO })
    await expect(findStoredCreation(client, { ...ARGS, requestHash: 'h' })).rejects.toBeInstanceOf(
      CreationRecordReadError,
    )
  })
})
