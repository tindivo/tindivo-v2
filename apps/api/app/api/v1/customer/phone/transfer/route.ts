import { transferPhoneHandler } from '@tindivo/backend/identity/http'
import { toNextRoute } from '@/src/next-adapter'

export const POST = toNextRoute(transferPhoneHandler)
