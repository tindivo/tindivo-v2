import { DomainError } from '@tindivo/core'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it } from 'vitest'
import type { DeviceRegistration } from '../application/ports'
import { SupabaseDeviceRepository } from './supabase-device-repository'

const INPUT: DeviceRegistration = {
  actorUserId: 'user-1',
  installId: '5f0f6d0e-2f86-4e8f-9c0e-3b2f6a1d7c11',
  platform: 'android',
  app: 'negocios',
  token: 'f'.repeat(64),
  environment: 'production',
  appVersion: '2.3.4',
  osVersion: null,
  deviceModel: null,
  locale: null,
  timezone: null,
  notificationsEnabled: false,
}

interface RpcResult {
  data: unknown
  error: { code: string; message: string } | null
}

function repositoryWith(result: RpcResult) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return result
    },
  }
  // Doble de prueba: solo implementa `rpc`, lo único que usa el adaptador.
  const typed = client as unknown as TypedSupabaseClient
  return { repository: new SupabaseDeviceRepository(() => typed), calls }
}

const ROW = {
  install_id: INPUT.installId,
  platform: 'android',
  app: 'negocios',
  notifications_enabled: false,
  created_at: '2026-10-19T07:00:00.123456+00:00',
  updated_at: '2026-10-19T07:05:00+00:00',
  token: 'f'.repeat(64),
}

describe('SupabaseDeviceRepository.register', () => {
  it('manda todos los argumentos (los opcionales como null) y responde sin el token', async () => {
    const { repository, calls } = repositoryWith({ data: ROW, error: null })
    const device = await repository.register(INPUT)
    expect(calls[0]?.name).toBe('register_push_device')
    expect(calls[0]?.args).toMatchObject({
      p_actor_user_id: 'user-1',
      p_os_version: null,
      p_device_model: null,
      p_locale: null,
      p_timezone: null,
      p_notifications_enabled: false,
    })
    expect(device).toEqual({
      installId: INPUT.installId,
      platform: 'android',
      app: 'negocios',
      notificationsEnabled: false,
      registeredAt: '2026-10-19T07:00:00.123Z',
      updatedAt: '2026-10-19T07:05:00.000Z',
    })
    expect(JSON.stringify(device)).not.toContain('f'.repeat(64))
  })

  it('traduce account_deleted a unauthorized', async () => {
    const { repository } = repositoryWith({
      data: null,
      error: { code: 'P0001', message: 'account_deleted' },
    })
    const err = await repository.register(INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('unauthorized')
  })

  it('traduce install_id_taken a conflict', async () => {
    const { repository } = repositoryWith({
      data: null,
      error: { code: 'P0001', message: 'install_id_taken' },
    })
    const err = await repository.register(INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('conflict')
  })

  it('cualquier otro error de la base es un fallo interno, no un error de dominio', async () => {
    const { repository } = repositoryWith({
      data: null,
      error: { code: '23514', message: 'check violation' },
    })
    const err = await repository.register(INPUT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(DomainError)
  })
})

describe('SupabaseDeviceRepository.unregister', () => {
  it('devuelve lo que dice la base', async () => {
    const { repository, calls } = repositoryWith({ data: true, error: null })
    expect(await repository.unregister('user-1', INPUT.installId)).toBe(true)
    expect(calls[0]).toEqual({
      name: 'unregister_push_device',
      args: { p_actor_user_id: 'user-1', p_install_id: INPUT.installId },
    })
  })

  it('un error de la base es un fallo interno', async () => {
    const { repository } = repositoryWith({ data: null, error: { code: 'XX000', message: 'boom' } })
    await expect(repository.unregister('user-1', INPUT.installId)).rejects.toThrow(/dar de baja/)
  })
})
