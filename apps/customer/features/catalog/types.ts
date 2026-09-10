import type { ScheduleDayRow } from '@tindivo/contracts'
import type { ActiveOrder } from '@/lib/active-orders'

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
  /**
   * Cómo se muestra el precio de las opciones. `additional_price` siempre es
   * un delta sobre `base_price` y el total lo sigue calculando el servidor:
   *
   * - `delta`: "+ S/ 3.00" / "Incluido". Recargos (salsas, extras).
   * - `total`: "S/ 26.00". Grupos donde la opción es el precio del plato
   *   (tamaños). Ahí "Incluido" mentía: la pizza pequeña sí cuesta.
   */
  price_display: 'delta' | 'total'
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
  /**
   * FRANJA EN QUE EL NEGOCIO SIRVE ESTE PLATO (migración 0226). Ausente o en
   * `null` = siempre, que es el caso de la inmensa mayoría.
   *
   * Llega CRUDA y la evalúa el cliente con `isWithinWindow`, igual que
   * `schedule` y `getOpenStatus`: así la card se apaga sola al cruzar la hora
   * sin recargar la página, que es ISR de 15 segundos.
   *
   * NO es lo mismo que `is_available`. Esa dice «se acabó»; esto, «no es su
   * turno», y al cliente hay que contarle cosas distintas: la segunda lleva
   * dentro cuándo volver.
   *
   * **Opcionales a propósito**, como `slug` unos tipos más arriba: `apps/api` se
   * despliega por separado y un `customer` nuevo contra una `api` vieja no los
   * recibe. Declararlos obligatorios no los hace aparecer, solo esconde el
   * hueco — y aquí el hueco significa «sin restricción», que es lo seguro.
   */
  available_days?: number[] | null
  available_from?: string | null
  available_to?: string | null
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
    /**
     * Identificador legible de la URL pública (`0165`).
     *
     * **Opcional a propósito.** Lo manda `apps/api`, que despliega por separado:
     * un `customer` nuevo contra una `api` vieja no lo recibe. Declararlo
     * obligatorio no lo hace aparecer, solo esconde el hueco. Para construir el
     * enlace, `businessPath()` de `@/lib/business-path`.
     */
    slug?: string | null
    name: string
    tagline: string | null
    accent_color: string
    banner_url: string | null
    estimated_eta_min: number
    estimated_eta_max: number
    accepts_web_pickup: boolean
    accepts_web_delivery: boolean
    /**
     * Los cinco de abajo ya venían en `BUSINESS_COLUMNS` del endpoint público;
     * este tipo simplemente no los declaraba. Los consume el JSON-LD de
     * `schema.org/Restaurant` en la página del negocio. Opcionales a propósito:
     * declararlos obligatorios rompería cualquier objeto de prueba existente,
     * y el JSON-LD ya sabe omitir lo que falte.
     */
    logo_url?: string | null
    address?: string | null
    coordinates_lat?: number | null
    coordinates_lng?: number | null
    /** `text[]` en la DB (hasta 2), NO un string. Suele llegar como `[]`. */
    categoria?: string[] | null
  }
  categories: Category[]
  schedule: ScheduleDayRow[]
  /**
   * Si el negocio confirmó hoy que atiende. `null` = no se pudo consultar, y
   * entonces manda solo el horario (ver `getOpenStatus`).
   */
  opening_confirmed?: boolean | null
}

export interface PublicBusiness {
  id: string
  /**
   * Identificador legible de la URL pública (`0165`).
   *
   * **Opcional a propósito.** Lo manda `apps/api`, que despliega por separado:
   * un `customer` nuevo contra una `api` vieja no lo recibe. Declararlo
   * obligatorio no lo hace aparecer, solo esconde el hueco. Para construir el
   * enlace, `businessPath()` de `@/lib/business-path`.
   */
  slug?: string | null
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

/**
 * `ActiveOrder` vive en `lib/active-orders.ts`, junto al store que lo produce y
 * que comparten la BottomNav, la ficha del negocio y /cuenta. Se reexporta aquí
 * para no reescribir los imports del catálogo, que ya lo pedían por este sitio.
 */
export type { ActiveOrder }

export type ActiveOrders = ActiveOrder[]
