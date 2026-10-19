import type { PushDevice, PushDeviceRegistration, UserRole } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { describe, expect, it } from 'vitest'
import type { Actor } from '../../identity'
import type { DeviceRegistration, DeviceRepository } from './ports'
import { registerDevice } from './register-device'
import { unregisterDevice } from './unregister-device'

const INSTALL_ID = '5f0f6d0e-2f86-4e8f-9c0e-3b2f6a1d7c11'

const REGISTERED: PushDevice = {
  installId: INSTALL_ID,
  platform: 'ios',
  app: 'customer',
  notificationsEnabled: true,
  registeredAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
}

function fakeDevices() {
  const registered: DeviceRegistration[] = []
  const unregistered: Array<{ actorUserId: string; installId: string }> = []
  const devices: DeviceRepository = {
    register: async (input) => {
      registered.push(input)
      return REGISTERED
    },
    unregister: async (actorUserId, installId) => {
      unregistered.push({ actorUserId, installId })
      return true
    },
  }
  return { devices, registered, unregistered }
}

function actorWith(...roles: UserRole[]): Actor {
  return { userId: 'user-1', roles, accessToken: 'jwt' }
}

function registration(overrides: Partial<PushDeviceRegistration> = {}): PushDeviceRegistration {
  return {
    platform: 'ios',
    app: 'customer',
    token: 'a'.repeat(64),
    environment: 'production',
    appVersion: '1.0.0',
    notificationsEnabled: true,
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof DomainError) return err
    throw err
  }
  throw new Error('Se esperaba un rechazo')
}

describe('registerDevice', () => {
  it.each([
    ['customer', 'customer'],
    ['negocios', 'business'],
    ['motorizados', 'driver'],
  ] as const)('acepta la app %s con el rol %s', async (app, role) => {
    const { devices, registered } = fakeDevices()
    const result = await registerDevice(
      { devices },
      { actor: actorWith(role), installId: INSTALL_ID, registration: registration({ app }) },
    )
    expect(result).toBe(REGISTERED)
    expect(registered).toHaveLength(1)
  })

  it.each([
    ['customer', 'driver'],
    ['negocios', 'customer'],
    ['motorizados', 'business'],
    ['negocios', 'admin'],
  ] as const)('rechaza con forbidden la app %s para el rol %s', async (app, role) => {
    const { devices, registered } = fakeDevices()
    const err = await rejection(
      registerDevice(
        { devices },
        { actor: actorWith(role), installId: INSTALL_ID, registration: registration({ app }) },
      ),
    )
    expect(err.code).toBe('forbidden')
    expect(registered).toHaveLength(0)
  })

  it('acepta a quien tiene varios roles si uno corresponde a la app', async () => {
    const { devices, registered } = fakeDevices()
    await registerDevice(
      { devices },
      {
        actor: actorWith('customer', 'driver'),
        installId: INSTALL_ID,
        registration: registration({ app: 'motorizados' }),
      },
    )
    expect(registered).toHaveLength(1)
  })

  it('toma la identidad del actor y convierte los opcionales ausentes en null', async () => {
    const { devices, registered } = fakeDevices()
    await registerDevice(
      { devices },
      { actor: actorWith('customer'), installId: INSTALL_ID, registration: registration() },
    )
    expect(registered[0]).toEqual({
      actorUserId: 'user-1',
      installId: INSTALL_ID,
      platform: 'ios',
      app: 'customer',
      token: 'a'.repeat(64),
      environment: 'production',
      appVersion: '1.0.0',
      osVersion: null,
      deviceModel: null,
      locale: null,
      timezone: null,
      notificationsEnabled: true,
    })
  })

  it('deja pasar el error del repositorio (cuenta eliminada) sin cambiarlo', async () => {
    const devices: DeviceRepository = {
      register: async () => {
        throw new DomainError('Esta cuenta fue eliminada', 'unauthorized')
      },
      unregister: async () => false,
    }
    const err = await rejection(
      registerDevice(
        { devices },
        { actor: actorWith('customer'), installId: INSTALL_ID, registration: registration() },
      ),
    )
    expect(err.code).toBe('unauthorized')
  })
})

describe('unregisterDevice', () => {
  it('pide la baja con el actor y la instalación', async () => {
    const { devices, unregistered } = fakeDevices()
    await unregisterDevice({ devices }, { actorUserId: 'user-1', installId: INSTALL_ID })
    expect(unregistered).toEqual([{ actorUserId: 'user-1', installId: INSTALL_ID }])
  })

  it('no distingue una instalación ajena o inexistente: no lanza', async () => {
    const devices: DeviceRepository = {
      register: async () => REGISTERED,
      unregister: async () => false,
    }
    await expect(
      unregisterDevice({ devices }, { actorUserId: 'user-1', installId: INSTALL_ID }),
    ).resolves.toBeUndefined()
  })
})
