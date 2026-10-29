import { pendingReviewHandler } from '@tindivo/backend/reviews/http'
import { toNextRoute } from '@/src/next-adapter'

export const GET = toNextRoute(pendingReviewHandler)
