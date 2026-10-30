import { createReviewHandler } from '@tindivo/backend/reviews/http'
import { toNextRoute } from '@/src/next-adapter'

export const POST = toNextRoute(createReviewHandler)
