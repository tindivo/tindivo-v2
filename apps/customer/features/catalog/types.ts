import type { ScheduleDayRow } from '@tindivo/contracts'

export interface ModOption {
  id: string
  name: string
  description: string | null
  additional_price: number
}

export interface ModGroupData {
  id: string
  name: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  options: ModOption[]
}

export interface ProductItem {
  id: string
  name: string
  description: string | null
  base_price: number
  image_url: string | null
  image_hue: number | null
  modifier_groups?: ModGroupData[]
}

export interface MenuItem extends ProductItem {
  category_id: string
  is_available: boolean
  is_compact: boolean
  badges: string[]
}

export interface Category {
  id: string
  name: string
  blurb: string | null
  items: MenuItem[]
}

export interface BusinessDetail {
  business: {
    id: string
    name: string
    tagline: string | null
    accent_color: string
    banner_url: string | null
    estimated_eta_min: number
    estimated_eta_max: number
    accepts_web_pickup: boolean
    accepts_web_delivery: boolean
  }
  categories: Category[]
  schedule: ScheduleDayRow[]
}

export interface PublicBusiness {
  id: string
  name: string
  tagline: string | null
  accent_color: string
  logo_url: string | null
  primary_capability: string
  estimated_eta_min: number
  estimated_eta_max: number
  /** null = sin horario configurado (siempre abierto, sin badge). */
  is_open_now?: boolean | null
}

export interface CatalogUser {
  signedIn: boolean
  name: string
  userId: string | null
}

export interface ActiveOrder {
  shortId: string
  status: string
  businessId: string
  createdAt: string
}
