import type { StoreAudience, StoreCondition, StoreSettings, StoreStatus } from '@tindivo/contracts'

/**
 * Forma de lo que devuelve `/admin/store*`. Espejo de `StoreAdminItemDto` en
 * `apps/api/lib/store/store.ts`: el admin no puede importar de la API.
 */
export interface StoreImage {
  id: string
  url: string
  thumbUrl: string
  position: number
}

export interface StoreItem {
  id: string
  code: string
  slug: string | null
  title: string | null
  description: string | null
  price: number | null
  originalPrice: number | null
  isClearance: boolean
  negotiable: boolean
  condition: StoreCondition | null
  conditionScore: number | null
  sizeLabel: string | null
  audience: StoreAudience | null
  status: StoreStatus
  categoryId: string | null
  categorySlug: string | null
  categoryName: string | null
  thumbUrl: string | null
  coverFocusX: number
  coverFocusY: number
  soldAt: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  images: StoreImage[]
  views: number
  whatsappClicks: number
}

export interface StoreMetrics {
  startedAt: string | null
  day: number
  totalDays: number
  published: number
  visits: number
  whatsappClicks: number
  sales: number
  amountSold: number
  navOut: number
  byRef: { ref: string; visits: number; whatsappClicks: number }[]
}

export interface Goal {
  min: number
  target: number
}

export interface StoreListData {
  items: StoreItem[]
  counts: Record<StoreStatus, number>
  drafts: { count: number; lastUpdatedAt: string | null }
  metrics: StoreMetrics
  goals: Record<'visits' | 'whatsappClicks' | 'sales' | 'amountSold', Goal>
}

export interface StoreCategory {
  id: string
  name: string
  slug: string
  icon: string
}

export interface StatusChange {
  product: StoreItem
  previous: { status: StoreStatus; soldAt: string | null }
}

export type { StoreSettings }
