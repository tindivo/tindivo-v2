import { PushDeviceParamsSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { defineHandler } from '../../../http'
import { unregisterDevice } from '../application/unregister-device'

export const unregisterDeviceHandler = defineHandler(
  {
    module: 'notifications',
    method: 'DELETE',
    path: '/api/v1/push/devices/{installId}',
    auth: 'user',
    params: PushDeviceParamsSchema,
    response: 'empty',
  },
  async ({ actor, params, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    await unregisterDevice(deps, { actorUserId: actor.userId, installId: params.installId })
    return undefined
  },
)
