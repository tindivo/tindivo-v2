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
  /**
   * Cuántos OTROS platos usan este mismo grupo. Un grupo se arma una vez en el
   * panel de Extras y se enlaza a varios platos, así que editarlo acá los toca
   * a todos: la card lo avisa antes de que alguien cambie una salsa creyendo
   * que solo afecta al plato que tiene abierto.
   */
  sharedWith?: number
  /**
   * ¿Está en la biblioteca de Extras del negocio, o es propio del plato donde
   * nació?
   *
   * Solo los de biblioteca salen en el buscador de «Vincular grupo de Extras».
   * Un grupo creado desde el editor de un plato nace en `false` y sube a la
   * biblioteca cuando el dueño lo decide — no se le pregunta al crearlo, porque
   * en ese momento todavía no sabe la respuesta: en prod hay once grupos
   * llamados «Salsas» con seis contenidos distintos.
   *
   * Undefined en un grupo recién creado en el formulario, que aún no ha pasado
   * por la carga; se trata como `false`.
   */
  isLibrary?: boolean
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
