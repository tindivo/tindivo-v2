export type RuleMode = 'required-one' | 'required-many' | 'optional-one' | 'optional-many'

/**
 * Cómo se escribe y se muestra el precio de las opciones del grupo. NO cambia
 * la aritmética: `additional_price` siempre guarda un delta sobre el precio
 * base y el servidor siempre suma (ver migración 0156).
 *
 * - `delta`: "+ S/ 3.00". Para recargos de verdad (salsas, extras).
 * - `total`: "S/ 26.00". Para grupos donde la opción ES el precio del plato
 *   (tamaños). El precio base queda atado a la opción más barata.
 */
export type PriceDisplay = 'delta' | 'total'

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
  price_display: PriceDisplay
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
