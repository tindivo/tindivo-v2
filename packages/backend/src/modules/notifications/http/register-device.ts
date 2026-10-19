import {
  PushDeviceParamsSchema,
  PushDeviceRegistrationSchema,
  PushDeviceSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { defineHandler } from '../../../http'
import { registerDevice } from '../application/register-device'

export const registerDeviceHandler = defineHandler(
  {
    module: 'notifications',
    method: 'PUT',
    path: '/api/v1/push/devices/{installId}',
    auth: 'user',
    params: PushDeviceParamsSchema,
    body: PushDeviceRegistrationSchema,
    response: PushDeviceSchema,
  },
  async ({ actor, params, body, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    return registerDevice(deps, { actor, installId: params.installId, registration: body })
  },
)
