import type { PaymentIntent } from '@tindivo/contracts'

// Vive en `lib/` porque los términos y condiciones prometen este mismo número y
// no pueden importar de una feature. Ver `lib/prepay.ts`.
export { DEFAULT_PREPAY_THRESHOLD } from '@/lib/prepay'

/**
 * Los dos plazos del prepago que el checkout le promete al cliente ANTES de
 * pedir: cuánto tarda el negocio en confirmar y cuántos minutos tendrá él
 * después para yapear.
 *
 * ESTO ES UN FALLBACK, NO LA VERDAD — igual que `DEFAULT_PREPAY_THRESHOLD`.
 * La verdad vive en `app_settings.timers` desde la `0174` y se edita desde
 * /admin/configuracion; el checkout la lee (la `0193` la puso en la whitelist
 * de lectura pública) y usa estos números solo mientras la consulta no vuelve.
 *
 * Coinciden a propósito con los de `features/tracking/lib/deadline.ts`: son las
 * dos únicas redes para la MISMA key, y si discreparan, el checkout prometería
 * un plazo y el seguimiento contaría otro sobre el mismo pedido.
 */
export const DEFAULT_PREPAY_TIMERS = { acceptance: 8, payment: 15 } as const

export interface PrepayTimers {
  /** Minutos que tiene el NEGOCIO para confirmar disponibilidad. */
  acceptance: number
  /** Minutos que tiene el CLIENTE para pagar y subir la captura. */
  payment: number
}

export const DEFAULT_MAX_CASH_BILL = 100
export const DEFAULT_MAX_CHANGE = 50
export const CASH_STEP = 0.5 // redondeo del input libre: múltiplos de S/0.50

/**
 * Tope de la nota al motorizado. Coincide a propósito con el `max(200)` del
 * contrato Zod y con el `left(..., 200)` de `create_customer_order` (0199): son
 * tres redes para el mismo número, y si discreparan el cliente escribiría algo
 * que el servidor recorta sin avisar.
 */
export const CUSTOMER_NOTE_MAX = 200
export const NEAR_DELIVERY_FEE = 2.0

/**
 * Recojo en tienda, desactivado para el piloto (DECISIONS.md: "pickup inactivo;
 * post-piloto"). Mientras esta bandera sea `false`, `unified-checkout` no
 * renderiza el selector y `deliveryMethod` se queda en 'delivery'.
 *
 * NO activarla sin recorrer el flujo entero primero. El backend lo soporta
 * (`delivery_fee = 0`, comisión de pickup configurada en 1.00) pero nunca se ha
 * ejercitado de punta a punta, y tiene un modo de fallo identificado:
 *
 *   Todas las transiciones intermedias las escribe el MOTORIZADO — 'take',
 *   'arrived', 'pickup', 'deliver'. En un recojo en tienda no hay motorizado,
 *   así que no está claro quién lleva el pedido a 'delivered'. Un pickup que se
 *   quede atascado además bloquea al cliente para volver a pedir de ese mismo
 *   restaurante, por el guard de pedido activo de 0105.
 */
export const PICKUP_ENABLED = false as boolean

/**
 * Por qué el cliente tiene (o no tiene) el envío gratis de la promo (0187).
 *
 * Lo decide la DB, no el navegador: sale tal cual de
 * `current_customer_promo_free_delivery()`. Aquí solo se traduce a copy.
 */
export type PromoReason =
  | 'active'
  | 'exhausted'
  | 'already_redeemed'
  | 'outside_window'
  | 'inactive'

export interface PromoState {
  eligible: boolean
  reason: PromoReason
}

/**
 * Estado inicial y de fallo. `inactive` + `eligible: false` es el lado seguro,
 * y aquí es el CONTRARIO al del caso de contraentrega: enseñar S/2 y que el
 * servidor cobre S/0 es una sorpresa agradable; enseñar S/0 y que cobre S/2 es
 * una queja a soporte. Y `inactive` no pinta ningún cartel, así que un timeout
 * de red nunca anuncia "promoción agotada".
 */
export const PROMO_DESCONOCIDA: PromoState = { eligible: false, reason: 'inactive' }

/**
 * El aviso que ve el cliente para cada motivo.
 *
 * `outside_window` e `inactive` devuelven null A PROPÓSITO: cuando la promo no
 * está viva, el checkout debe verse exactamente como antes de que existiera. Un
 * "promoción agotada" en septiembre habla de algo que ya no existe, y hace
 * parecer que el cliente llegó tarde a algo que sigue en pie.
 */
export function promoAviso(reason: PromoReason): string | null {
  switch (reason) {
    case 'active':
      return 'Promo de lanzamiento: tu envío va por nuestra cuenta.'
    case 'exhausted':
      return 'La promo de envío gratis se agotó.'
    case 'already_redeemed':
      return 'Ya usaste tu envío gratis de lanzamiento.'
    default:
      return null
  }
}

export interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
  coordinates_lat: number | null
  coordinates_lng: number | null
  /** NULL = ese punto no lo eligió nadie (ver migración 0202). */
  location_confirmed_at: string | null
}

export interface OrderResult {
  id: string
  shortId: string
  status: string
  total: number
}

export interface CustomerProfile {
  full_name: string | null
  phone: string | null
  phone_verified_at: string | null
  contraentrega_blocked?: boolean | null
  blocked_until?: string | null
}

export type GeoBlockKind = 'far' | 'unavailable' | 'low_accuracy'

export interface GpsValidationPayload {
  lat?: number
  lng?: number
  accuracyM?: number
  distanceToCenterKm?: number
  method: 'gps_high_accuracy' | 'gps_low_accuracy' | 'manual_skip_prepaid' | 'failed'
}

export type CashChoice = 'exact' | '20' | '50' | '100' | 'custom'

export const CASH_CHIPS: { value: CashChoice; label: string; amount: number | null }[] = [
  { value: 'exact', label: 'Exacto', amount: null },
  { value: '20', label: 'S/ 20', amount: 20 },
  { value: '50', label: 'S/ 50', amount: 50 },
  { value: '100', label: 'S/ 100', amount: 100 },
]

export interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  total: number
  hasProof: boolean
}

/**
 * CUÁNDO paga el cliente. Es el eje que organiza la lista de métodos, y no el
 * «con qué», porque es la única pregunta que el cliente se hace de verdad al
 * llegar aquí: ¿saco la plata ahora o cuando llegue el motorizado?
 *
 * Antes la lista era plana y dos de las tres opciones —«Billetera digital al
 * recibir» y «Prepago con billetera digital»— llevaban EL MISMO par de logos,
 * Yape y Plin, una encima de la otra. El ojo escanea logos antes que texto, así
 * que se leían como la misma fila repetida y lo único que las separaba, el
 * momento, quedaba enterrado en la letra pequeña.
 */
export type PaymentMoment = 'al_recibir' | 'adelantado'

export interface PaymentOption {
  value: PaymentIntent
  label: string
  desc: string
  logos: string[]
  momento: PaymentMoment
}

/** Las cabeceras de la lista de pago, en el orden en que se pintan. */
export const PAYMENT_MOMENTS: { momento: PaymentMoment; titulo: string }[] = [
  { momento: 'al_recibir', titulo: 'Al recibir' },
  { momento: 'adelantado', titulo: 'Por adelantado' },
]

/**
 * Los títulos NO repiten el momento —«al recibir», «por adelantado»— porque ya
 * lo dice la cabecera de su grupo. Repetirlo en cada fila era lo que obligaba a
 * leer hasta el final de la línea para distinguir dos opciones que, de un
 * vistazo, se ven idénticas.
 *
 * Los subtítulos dicen A QUIÉN se le paga, que es lo concreto: «al motorizado en
 * tu puerta» se imagina, «al recibir tu pedido» no.
 */
export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    value: 'pending_cash',
    label: 'Efectivo',
    desc: 'Le pagas al motorizado en tu puerta',
    logos: ['cash'],
    momento: 'al_recibir',
  },
  {
    value: 'pending_yape',
    // «Billetera digital» es palabra de banco, y con los dos logos al lado el
    // título no necesita nombrar la categoría.
    //
    // El subtítulo NO dice «le yapeas». Es el verbo que se usa en la calle, pero
    // es de marca: convierte en Yape una opción que también es Plin, igual que
    // hacía el «ten tu Yape a la mano» del seguimiento. «Transfieres» es neutral
    // y vale para las dos.
    label: 'Yape o Plin',
    desc: 'Le transfieres al motorizado en tu puerta',
    logos: ['yape', 'plin'],
    momento: 'al_recibir',
  },
  {
    value: 'prepaid',
    // El subtítulo ha cambiado dos veces y las dos por el mismo motivo: decía
    // algo cierto SOLO en el contexto en que se escribió.
    //   · «Paga ahora con Yape/Plin y sube tu comprobante» era una instrucción
    //     falsa en el instante en que se lee: al elegir esta opción no se paga
    //     nada todavía, el negocio tiene que confirmar disponibilidad primero.
    //   · «Pagas después, no ahora» se escribió cuando esta era la ÚNICA opción
    //     en pantalla, contra un «paga ahora» que ya no existía. Con las tres a
    //     la vista era peor: la opción de al recibir TAMBIÉN es «después», así
    //     que la frase que debía distinguirlas las confundía.
    // «Apenas el local confirme» ancla el pago a un hecho, no a un adverbio, y
    // se sostiene solo con la lista entera delante.
    label: 'Yape o Plin',
    desc: 'Pagas apenas el local confirme',
    logos: ['yape', 'plin'],
    momento: 'adelantado',
  },
]

/**
 * El icono de una dirección guardada, por su etiqueta.
 *
 * Sustituye a `labelEmoji` SOLO en el checkout. Aquel devuelve 🏠/💼/📍 y sigue
 * vivo en el selector de etiqueta del formulario de dirección, donde el emoji
 * va dentro de un chip de texto y se lee como parte de la palabra. Aquí el
 * icono va solo, dentro de un cuadrado de color, haciendo de icono: un emoji
 * ahí se ve de otro tamaño en cada teléfono, no toma el color de la marca, y
 * choca con la regla del propio DS —Material Symbols para iconografía— que ya
 * existe por el incidente del 2026-08-18.
 */
export function addressIcon(label: string): string {
  return label === 'Casa' ? 'home' : label === 'Trabajo' ? 'work' : 'location_on'
}

/**
 * QUÉ FALTA PARA PODER CONFIRMAR.
 *
 * Antes esto era un `string | null` suelto (`error`) que solo existía DESPUÉS
 * de tocar el CTA, y se pintaba al final del scroll: si faltaba la referencia
 * de la dirección, el aviso salía a ~600 px del campo que lo causaba, con la
 * pantalla ya scrolleada al fondo por el propio acto de tocar el botón.
 *
 * Con el campo dentro del objeto, la misma falta puede hacer tres cosas a la
 * vez sin repetir la regla: nombrar el CTA, marcar la fila y decidir a dónde
 * llevar al cliente.
 */
export type CheckoutField = 'cart' | 'address' | 'name' | 'phone' | 'cash'

export interface CheckoutIssue {
  field: CheckoutField
  /** Lo que se pinta junto al campo que falla. */
  message: string
  /**
   * Lo que dice el CTA mientras esta sea la primera falta. Es una ORDEN, no un
   * diagnóstico: «Agrega tu dirección», no «Falta la dirección». El botón sigue
   * siendo un botón, así que tiene que decir qué pasa al tocarlo.
   */
  cta: string
}
