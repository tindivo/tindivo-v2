// Capa de mapeo: fila de `orders` (backend) → view-model que consumen las cards
// y el detalle del dashboard. Aquí vive la lógica de columnas, buffer gradual y
// la generalización de pagos (Yape/Plin → "billetera digital").

export type UiSource = 'web' | 'manual'
export type UiPayment = 'pending_cash' | 'pending_wallet' | 'prepaid' | 'pending_mixed'
export type UiState =
  | 'pending_acceptance'
  | 'awaiting_payment'
  | 'validando'
  | 'cooking'
  | 'buffer_p1'
  | 'buffer_p2'
  | 'buffer_p3'
  | 'heading'
  | 'waiting'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
export type OrderColumn = 'nuevos' | 'cocina' | 'reparto' | 'entregados'

/** Columnas a traer de `orders` para el kanban (incl. nombre del motorizado). */
export const ORDER_SELECT =
  'id,short_id,status,source,customer_name,customer_phone,delivery_reference,delivery_method,' +
  'order_amount,delivery_fee,payment_intent,payment_proof_status,comprobante_prepago_url,proof_attempt,' +
  'prep_time_minutes,estimated_ready_at,prep_extension_count,' +
  'ready_early_used,ready_early_at,' +
  'client_pays_with,change_to_give,' +
  'yape_amount,cash_amount,requires_validation,validation_reason_code,risk_flags,' +
  'driver_id,created_at,pending_acceptance_at,awaiting_payment_at,validating_at,' +
  'waiting_driver_at,picked_up_at,delivered_at,cancelled_at,cancel_note,cancel_reason,driver:drivers(full_name)'

const limaTime = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

function fmtTime(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? limaTime.format(t) : null
}

export interface OrderRow {
  id: string
  short_id: string
  status: string
  source: string
  customer_name: string | null
  customer_phone: string | null
  delivery_reference: string | null
  delivery_method: string
  order_amount: number
  delivery_fee: number
  payment_intent: string
  payment_proof_status: string | null
  comprobante_prepago_url: string | null
  proof_attempt?: number | null
  prep_time_minutes: number | null
  estimated_ready_at: string | null
  prep_extension_count: number | null
  ready_early_used: boolean | null
  ready_early_at: string | null
  client_pays_with: number | null
  change_to_give: number | null
  yape_amount: number | null
  cash_amount: number | null
  requires_validation: boolean | null
  validation_reason_code: string | null
  risk_flags: Record<string, unknown> | null
  driver_id: string | null
  created_at: string
  pending_acceptance_at: string | null
  awaiting_payment_at: string | null
  validating_at: string | null
  waiting_driver_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancel_note: string | null
  cancel_reason: string | null
  driver?: { full_name: string | null } | null
}

export interface OrderVM {
  rowId: string
  id: string
  source: UiSource
  payment: UiPayment
  status: string
  state: UiState
  customer: string | null
  phone: string | null
  addressRef: string | null
  method: 'delivery' | 'pickup'
  total: number
  amount: number
  subtotal: number
  deliveryFee: number
  countdownSec: number
  prepMinutes: number | null
  minutesLeft: number | null
  /** Segundos con signo entre `now` y `estimated_ready_at`. Positivo = tiempo restante, negativo = retraso. */
  readySec: number | null
  /**
   * Segundos que el pedido lleva encima del motorizado, o `null` fuera de
   * reparto.
   *
   * La columna "En reparto" lleva de rótulo "timer desde recogida" y no había
   * ningún timer: en `picked_up` el reloj de cocina se apaga —correcto, la
   * comida ya salió— y no empezaba ninguno. La cabecera prometía un dato que la
   * tarjeta no daba.
   *
   * Cuenta HACIA ARRIBA, como el de `motorizados`: con varios pedidos en la
   * calle, cuál lleva más tiempo rodando es lo que decide a quién llamar
   * primero cuando un cliente reclama.
   */
  deliverySec: number | null
  bufferMinutes: number | null
  pickupMinAgo: number | null
  driver: { name: string } | null
  paysWith: number | null
  cashChange: number | null
  walletPart: number | null
  cashPart: number | null
  requiresValidation: boolean
  validationReasonCode: string | null
  riskFlags: Record<string, unknown>
  extensionUsed: boolean
  extensionMin: number | null
  /** La cajera ya declaró la comida lista. Oculta el botón y el cronómetro. */
  readyEarly: boolean
  /**
   * ¿Está la comida hecha? Por la marca O POR EL ESTADO.
   *
   * `readyEarly` dice que la cajera pulsó el botón, no que la comida exista, y
   * son cosas distintas: en los `buffer_*` la comida está hecha por definición
   * del estado —`waiting_driver` significa hoy "lista y nadie la ha tomado",
   * ver `bufferPhase`— aunque nadie haya pulsado nada.
   *
   * Vive aquí y no en la tarjeta porque el detalle necesita el mismo hecho: con
   * la derivación duplicada, las dos pantallas ya se habían contradicho sobre el
   * mismo pedido (insignia "Lista · esperando moto" contra reloj "Demorado").
   */
  comidaLista: boolean
  /** `true` si "Marcar listo" tiene sentido: la comida puede seguir en cocina. */
  canMarkReady: boolean
  proofStatus: string | null
  proofUrl: string | null
  proofAttempt: number
  createdAtFormatted: string | null
  closedAt: string | null
  cancelReason: string | null
  cancelReasonCode: string | null
}

// Timeouts canónicos (DECISIONS.md §10). Configurables en app_settings.timers;
// para la Fase 1 los defaults coinciden.
const ACCEPT_SEC = 5 * 60
const VALIDATE_SEC = 5 * 60
const PREPAY_SEC = 10 * 60

/**
 * Formatea los segundos hasta/desde `estimated_ready_at` en `mm:ss` con signo.
 * - Signo negativo si ya pasó (`-02:45` = retraso de 2 min 45 seg).
 * - Sin signo si está a tiempo (`04:30` = 4 min 30 seg restantes).
 */
export function formatReadyDelta(sec: number): string {
  const absSec = Math.abs(Math.round(sec))
  const sign = sec < 0 ? '-' : ''
  if (absSec >= 3600) {
    const hours = Math.floor(absSec / 3600)
    const mins = Math.floor((absSec % 3600) / 60)
    return `${sign}${hours}h ${String(mins).padStart(2, '0')}m`
  }
  const min = Math.floor(absSec / 60)
  const remSec = absSec % 60
  return `${sign}${String(min).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`
}

function minutesSince(iso: string | null, now: number): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60000))
}

function secondsUntil(iso: string | null, addSec: number, now: number): number {
  if (!iso) return addSec
  return Math.max(0, Math.round((Date.parse(iso) + addSec * 1000 - now) / 1000))
}

/**
 * Escalado de alarma para un pedido en `waiting_driver` sin motorizado.
 *
 * `waiting_driver` cambió de significado. Antes era el estado normal de
 * tránsito y un escalado suave tenía sentido. Ahora el flujo normal va
 * `preparing` → `heading_to_restaurant`, saltándoselo: si un pedido cae aquí
 * es que la comida está lista y nadie la ha tomado. Es la excepción, y a los
 * 5 minutos ya es demasiado tarde — por eso el rojo entra antes que antes.
 */
function bufferPhase(mins: number): UiState {
  if (mins < 2) return 'buffer_p1'
  if (mins < 4) return 'buffer_p2'
  return 'buffer_p3'
}

/**
 * Estados en los que el reloj de COCINA todavía significa algo.
 *
 * LOS `buffer_*` ESTÁN AQUÍ, Y ESO ERA EL BUG. Sin ellos, pulsar "Pedido listo"
 * en un pedido sin motorizado apagaba el cronómetro: `advance_order('ready')`
 * pasa el status a `waiting_driver` y, sin `driver_id`, `getUiState` lo
 * clasifica como `buffer_p1`. Ese estado no estaba en la lista, así que
 * `readySec` y `minutesLeft` se volvían `null` de golpe y la tarjeta se quedaba
 * sin reloj — justo la regresión que `DECISIONS §23` arregló y prohibió por
 * escrito ("`ready_early_used` NO debe usarse como guarda para ocultar el
 * temporizador"), reaparecida por otra puerta: no por la marca, sino por el
 * cambio de estado que la acompaña.
 *
 * Es además el caso NORMAL, no el raro: la comida suele estar antes de que un
 * motorizado tome el pedido. La cajera marcaba listo y perdía de vista el único
 * número que le dice cuánto lleva la comida en el mostrador enfriándose.
 *
 * `motorizados` nunca tuvo el fallo porque su reloj se apaga por un hecho del
 * dominio —`status === 'picked_up'`, o sea la comida ya salió— y no por una
 * lista de estados de UI que hay que acordarse de ampliar.
 *
 * `picked_up` NO está aquí a propósito: ahí el reloj de cocina dejó de
 * significar nada y empieza otro, el de reparto (`deliverySec`).
 */
const COOKING_CLOCK_STATES: ReadonlySet<UiState> = new Set<UiState>([
  'cooking',
  'buffer_p1',
  'buffer_p2',
  'buffer_p3',
  'heading',
  'waiting',
])

export function mapPayment(intent: string): UiPayment {
  if (intent === 'pending_yape') return 'pending_wallet'
  if (intent === 'prepaid' || intent === 'pending_cash' || intent === 'pending_mixed') return intent
  return 'pending_cash'
}

export function getColumn(status: string): OrderColumn {
  if (status === 'pending_acceptance' || status === 'awaiting_payment' || status === 'validando')
    return 'nuevos'
  if (
    [
      'confirmed',
      'preparing',
      'waiting_driver',
      'heading_to_restaurant',
      'waiting_at_restaurant',
    ].includes(status)
  )
    return 'cocina'
  if (status === 'picked_up') return 'reparto'
  return 'entregados'
}

function getUiState(row: OrderRow, now: number): UiState {
  switch (row.status) {
    case 'pending_acceptance':
      return 'pending_acceptance'
    case 'awaiting_payment':
      return 'awaiting_payment'
    case 'validando':
      return 'validando'
    case 'confirmed':
    case 'preparing':
      return 'cooking'
    case 'waiting_driver':
      return row.driver_id ? 'heading' : bufferPhase(minutesSince(row.waiting_driver_at, now))
    case 'heading_to_restaurant':
      return 'heading'
    case 'waiting_at_restaurant':
      return 'waiting'
    case 'picked_up':
      return 'picked_up'
    case 'delivered':
      return 'delivered'
    default:
      return 'cancelled'
  }
}

/** Convierte una fila de `orders` en el view-model que consume la UI. */
export function toOrderVM(row: OrderRow, now: number = Date.now()): OrderVM {
  const state = getUiState(row, now)
  const payment = mapPayment(row.payment_intent)
  const amount = Number(row.order_amount ?? 0)
  const deliveryFee = Number(row.delivery_fee ?? 0)

  const countdownSec =
    row.status === 'pending_acceptance'
      ? secondsUntil(row.pending_acceptance_at ?? row.created_at, ACCEPT_SEC, now)
      : row.status === 'awaiting_payment'
        ? secondsUntil(
            row.awaiting_payment_at ?? row.validating_at ?? row.created_at,
            PREPAY_SEC,
            now,
          )
        : row.status === 'validando'
          ? secondsUntil(
              row.validating_at ?? row.created_at,
              row.payment_intent === 'prepaid' ? PREPAY_SEC : VALIDATE_SEC,
              now,
            )
          : 0

  // Minutos que faltan para que la comida esté lista.
  //
  // Se calcula también en `heading` y `waiting`, no solo en `cooking`: bajo el
  // diseño actual el motorizado toma el pedido con 10 minutos de cocción
  // restantes, así que el solapamiento "moto asignada + comida cocinándose" es
  // el caso normal de todos los pedidos, no una excepción. La cajera necesita
  // seguir viendo el reloj justo cuando el motorizado va en camino.
  //
  // En esos dos estados solo se muestra si la comida sigue cocinándose: si
  // `estimated_ready_at` ya pasó, o si se marcó listo antes de tiempo, no hay
  // nada que contar.
  const readyAtMs = row.estimated_ready_at ? Date.parse(row.estimated_ready_at) : null
  const minutesLeft = !COOKING_CLOCK_STATES.has(state)
    ? null
    : readyAtMs != null
      ? Math.max(0, Math.ceil((readyAtMs - now) / 60000))
      : state === 'cooking'
        ? (row.prep_time_minutes ?? null)
        : null

  const readySec =
    readyAtMs != null && COOKING_CLOCK_STATES.has(state)
      ? Math.round((readyAtMs - now) / 1000)
      : null

  // Segundos que el pedido lleva encima del motorizado. Ver `deliverySec`.
  const deliverySec =
    state === 'picked_up' && row.picked_up_at != null
      ? Math.round((now - Date.parse(row.picked_up_at)) / 1000)
      : null

  const extCount = row.prep_extension_count ?? 0

  return {
    rowId: row.id,
    id: row.short_id,
    source: row.source === 'business_manual' ? 'manual' : 'web',
    payment,
    status: row.status,
    state,
    customer: row.customer_name,
    phone: row.customer_phone,
    addressRef: row.delivery_reference,
    method: row.delivery_method === 'pickup' ? 'pickup' : 'delivery',
    total: amount + deliveryFee,
    amount,
    subtotal: amount,
    deliveryFee,
    countdownSec,
    prepMinutes: row.prep_time_minutes ?? null,
    minutesLeft,
    readySec,
    deliverySec,
    bufferMinutes:
      state === 'buffer_p1' || state === 'buffer_p2' || state === 'buffer_p3'
        ? minutesSince(row.waiting_driver_at, now)
        : null,
    pickupMinAgo: state === 'picked_up' ? minutesSince(row.picked_up_at, now) : null,
    driver: row.driver?.full_name
      ? { name: row.driver.full_name }
      : row.driver_id
        ? { name: 'Motorizado' }
        : null,
    paysWith: row.client_pays_with != null ? Number(row.client_pays_with) : null,
    cashChange: row.change_to_give != null ? Number(row.change_to_give) : null,
    walletPart: row.yape_amount != null ? Number(row.yape_amount) : null,
    cashPart: row.cash_amount != null ? Number(row.cash_amount) : null,
    requiresValidation: Boolean(row.requires_validation),
    validationReasonCode: row.validation_reason_code,
    riskFlags: row.risk_flags ?? {},
    extensionUsed: extCount > 0,
    extensionMin: extCount > 0 ? extCount * 10 : null,
    readyEarly: Boolean(row.ready_early_used),
    comidaLista:
      Boolean(row.ready_early_used) ||
      state === 'buffer_p1' ||
      state === 'buffer_p2' ||
      state === 'buffer_p3',
    // Los mismos cuatro estados que acepta advance_order('ready').
    canMarkReady:
      !row.ready_early_used &&
      ['preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant'].includes(
        row.status,
      ),
    proofStatus: row.payment_proof_status,
    proofUrl: row.comprobante_prepago_url,
    proofAttempt: row.proof_attempt ?? 0,
    createdAtFormatted: fmtTime(row.created_at),
    closedAt: fmtTime(row.delivered_at ?? row.cancelled_at),
    cancelReason: row.status === 'cancelled' ? row.cancel_note : null,
    cancelReasonCode: row.status === 'cancelled' ? row.cancel_reason : null,
  }
}

/** Prioridad de la columna "En cocina" (waiting > p3 > p2 > heading > p1 > cooking). */
export const COOKING_PRIORITY: Record<string, number> = {
  waiting: 0,
  buffer_p3: 1,
  buffer_p2: 2,
  heading: 3,
  buffer_p1: 4,
  cooking: 5,
}

function getUrgencyTier(o: OrderVM): number {
  // 1. Motorizado en puerta esperando entrega (acción física ahora)
  if (o.state === 'waiting') return 1

  // 2. buffer_p3 (15m+ sin moto)
  if (o.state === 'buffer_p3') return 2

  // 3. Cocina retrasada (readySec < 0 & !readyEarly)
  if (o.readySec != null && o.readySec < 0 && !o.readyEarly) return 3

  // 4. Comida lista esperando > queue_lead_minutes (readySec < 0 & readyEarly & abs > 600)
  if (o.readySec != null && o.readySec < 0 && o.readyEarly && Math.abs(o.readySec) > 600) return 4

  // 5. buffer_p2 O comida lista esperando <= queue_lead_minutes
  if (o.state === 'buffer_p2') return 5
  if (o.readySec != null && o.readySec < 0 && o.readyEarly && Math.abs(o.readySec) <= 600) return 5

  // 6. Cocinando a tiempo (heading, buffer_p1, cooking a tiempo)
  return 6
}

export function sortCooking(a: OrderVM, b: OrderVM): number {
  const tierA = getUrgencyTier(a)
  const tierB = getUrgencyTier(b)
  if (tierA !== tierB) return tierA - tierB

  const aSec = a.readySec ?? 99999
  const bSec = b.readySec ?? 99999
  return aSec - bSec
}

// ── Busy mode helpers ─────────────────────────────────────────────────────────
export function isBusinessPaused(until: string | null, now: number = Date.now()): boolean {
  if (!until) return false
  if (until === 'infinity') return true
  const t = Date.parse(until)
  return Number.isFinite(t) && t > now
}

export function pauseMinutesLeft(until: string | null, now: number = Date.now()): number | null {
  if (!until || until === 'infinity') return null
  const t = Date.parse(until)
  if (!Number.isFinite(t) || t <= now) return null
  return Math.max(1, Math.ceil((t - now) / 60000))
}
