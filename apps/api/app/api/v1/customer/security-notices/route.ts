import { securityNoticesHandler } from '@tindivo/backend/identity/http'
import { toNextRoute } from '@/src/next-adapter'

export const GET = toNextRoute(securityNoticesHandler)
