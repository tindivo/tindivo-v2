import { reorderHandler } from '@tindivo/backend/ordering/http'
import { toNextRoute } from '@/src/next-adapter'

export const GET = toNextRoute(reorderHandler)
