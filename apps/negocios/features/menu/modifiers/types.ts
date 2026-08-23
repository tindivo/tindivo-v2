export type PriceDisplay = 'delta' | 'total'

export type RuleMode = 'required-one' | 'required-many' | 'optional-one' | 'optional-many'

export interface LibraryOption {
  id: string
  name: string
  additional_price: number
  is_available: boolean
  display_order: number
}

/**
 * Un grupo tal como vive en la biblioteca del negocio: con sus opciones y con
 * la lista de platos que lo usan. `itemIds` es lo que convierte al grupo en
 * reutilizable — la misma fila enlazada a varios platos, de modo que agotar
 * una opción la agota en todos a la vez.
 */
export interface LibraryGroup {
  id: string
  name: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number | null
  price_display: PriceDisplay
  display_order: number
  options: LibraryOption[]
  itemIds: string[]
}

export interface LibraryItem {
  id: string
  name: string
  categoryName: string
}
