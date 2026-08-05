export type RuleMode = 'required-one' | 'required-many' | 'optional-one' | 'optional-many'

export interface ModifierOption {
  id: string
  localId: string
  name: string
  additional_price: number
  is_available: boolean
  display_order: number
  isNew?: boolean
  isDeleted?: boolean
}

export interface ModifierGroup {
  id: string
  localId: string
  name: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  display_order: number
  options: ModifierOption[]
  isNew?: boolean
  isDeleted?: boolean
  isExpanded: boolean
}

export interface FormData {
  name: string
  description: string
  category_id: string
  base_price: string
  is_available: boolean
  is_compact: boolean
  image_url: string | null
  badges: string[]
}

export interface Category {
  id: string
  name: string
}
