export interface ModifierOption {
  id: string
  is_available: boolean
  additional_price: number
}

export interface ModifierGroup {
  id: string
  is_required: boolean
  max_selections: number | null
  options: ModifierOption[]
}

export interface MenuItem {
  id: string
  name: string
  base_price: number
  is_available: boolean
  is_compact: boolean
  badges: string[]
  imageUrl: string | null
  modifierGroups: ModifierGroup[]
}

export interface MenuCategory {
  id: string
  name: string
  display_order: number
  items: MenuItem[]
}

export interface CatRow {
  id: string
  name: string
  blurb: string
  display_order: number
  is_active: boolean
  itemCount: number
}
