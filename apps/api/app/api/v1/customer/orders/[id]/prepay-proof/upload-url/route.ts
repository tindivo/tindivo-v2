import { prepayProofUploadUrlHandler } from '@tindivo/backend/ordering/http'
import { toNextRoute } from '@/src/next-adapter'

export const POST = toNextRoute(prepayProofUploadUrlHandler)
