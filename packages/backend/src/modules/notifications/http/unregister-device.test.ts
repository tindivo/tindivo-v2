import { OPERATIONS } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import type { Deps } from '../../../composition'
import { createLogger } from '../../../shared'
import { SupabaseDeviceRepository } from '../infra/supabase-device-repository'
import { unregisterDeviceHandler } from './unregister-device'

interface RpcResult {
  data: unknown
  error: { code: string; message: string } | null
}

const INSTALL_ID = '5f0f6d0e-2f86-4e8f-9c0e-3b2f6a1d7c11'

function handlerWith(result: RpcResult) {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(name)
      return result
    },
  }
  // Doble de prueba: solo implementa `rpc`, lo único que usa el adaptador.
  const typed = client as unknown as TypedSupabaseClient
  const deps: Deps = {
    auth: {
      authenticate: async (request) => {
        const header = request.headers.get('authorization')
        if (!header) throw new DomainError('No autenticado', 'unauthorized')
        return { userId: 'u1', roles: ['customer'], accessToken: header.slice(7) }
      },
    },
    clock: { now: () => new Date('2026-10-20T12:00:00.000Z') },
    devices: new SupabaseDeviceRepository(() => typed, { sleep: async () => {} }),
    ids: { uuid: () => 'generated-id' },
    logger: createLogger({ module: 'test', sink: { write: () => {} } }),
    proofStorage: {
      remove: async () => {
        throw new Error('no se usa en estas pruebas')
      },
    },
    retention: {
      listDueAccounts: async () => [],
      precheck: async () => 'ok',
      listProofObjects: async () => [],
      finishPurge: async () => {
        throw new Error('no se usa en estas pruebas')
      },
    },
    supabase: () => typed,
  }
  return { handler: unregisterDeviceHandler.withDeps(deps), calls }
}

const baja = (): Request =>
  new Request(`http://localhost/api/v1/push/devices/${INSTALL_ID}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer tok' },
  })

const ctx = { installId: INSTALL_ID }

describe('DELETE /push/devices/{installId}', () => {
  it('con el deadlock persistente responde 409 conflict tras 3 intentos', async () => {
    const { handler, calls } = handlerWith({
      data: null,
      error: { code: '40P01', message: 'deadlock detected' },
    })
    const res = await handler(baja(), ctx)
    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/)
    expect(await res.json()).toMatchObject({ code: 'conflict' })
    expect(calls).toEqual([
      'unregister_push_device',
      'unregister_push_device',
      'unregister_push_device',
    ])
  })

  it('con la baja hecha responde 204 sin cuerpo', async () => {
    const { handler, calls } = handlerWith({ data: true, error: null })
    const res = await handler(baja(), ctx)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(calls).toHaveLength(1)
  })

  it('el contrato publicado declara el 409 conflict de la operación', () => {
    const op = OPERATIONS.find((o) => o.operationId === 'unregisterPushDevice')
    expect(op?.errors).toContain('conflict')
  })
})
