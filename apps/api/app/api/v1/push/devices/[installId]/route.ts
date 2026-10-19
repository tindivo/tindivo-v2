import { registerDeviceHandler, unregisterDeviceHandler } from '@tindivo/backend/notifications'
import { toNextRoute } from '@/src/next-adapter'

export const PUT = toNextRoute(registerDeviceHandler)
export const DELETE = toNextRoute(unregisterDeviceHandler)
