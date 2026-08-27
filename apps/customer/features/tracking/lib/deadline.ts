import type { Tracking } from '@/features/tracking/types'

/**
 * Los relojes que el cliente puede perder, y cuál corre ahora mismo.
 *
 * Un pedido prepago atraviesa TRES esperas con plazo, y se confunden con
 * facilidad porque las tres acaban en `cancelled` con el mismo `prepay_timeout`:
 *
 *   · `pending_acceptance` ·  8 min · el NEGOCIO confirma disponibilidad
 *   · `awaiting_payment`   · 15 min · el CLIENTE yapea y sube la captura
 *   · `validando`          · 10 min · la CAJERA revisa esa captura
 *
 * Los minutos no se escriben aquí. Vienen de `app_settings.timers` vía
 * `get_tracking` (0117, 0170, 0172) porque son editables desde /admin, y un
 * número clavado en el cliente no falla hoy: falla el día que alguien toca el
 * panel, enseñando un plazo que la base ya no respeta. Los `??` son solo la red
 * para una respuesta vieja en caché, no el sitio donde vive la verdad.
 *
 * **Cada `at` tiene que coincidir con lo que cancela de verdad**, que desde la
 * `0174` es una sola función: `cancel_expired_prepay_orders()`, que corre cada
 * minuto por pg_cron y lee esos mismos minutos de `app_settings`. Si esta
 * función promete más tiempo del que da la base, el cliente ve un contador
 * corriendo sobre un pedido ya muerto.
 */
export type DeadlineKind = 'acceptance' | 'payment' | 'verification'

export interface Deadline {
  kind: DeadlineKind
  /** Epoch ms en que la base cancela el pedido. */
  at: number
  /** Ventana completa en ms, para pintar cuánto queda en proporción. */
  totalMs: number
}

function build(
  kind: DeadlineKind,
  base: string | null | undefined,
  minutes: number,
): Deadline | null {
  if (!base) return null
  const start = Date.parse(base)
  if (!Number.isFinite(start)) return null
  const totalMs = minutes * 60_000
  return { kind, at: start + totalMs, totalMs }
}

/**
 * El plazo activo, o `null` si el estado actual no tiene ninguno que enseñar.
 *
 * Devuelve `null` a propósito en dos casos que SÍ tienen reloj en la base:
 *
 *   · `validando` de contraentrega (5 min de validación humana). El cliente no
 *     puede hacer nada con ese número; enseñárselo es angustia sin salida.
 *   · `validando` de prepago SIN comprobante, que es un estado que
 *     `create_customer_order` no produce. Sin captura subida no hay nada que
 *     esperar que el cliente entienda.
 */
export function activeDeadline(data: Tracking): Deadline | null {
  switch (data.status) {
    case 'pending_acceptance':
      return build(
        'acceptance',
        data.pendingAcceptanceAt ?? data.createdAt,
        data.acceptanceMinutes ?? 8,
      )
    case 'awaiting_payment':
      return build(
        'payment',
        data.awaitingPaymentAt ?? data.validatingAt ?? data.createdAt,
        data.paymentMinutes ?? 15,
      )
    case 'validando':
      if (data.paymentIntent !== 'prepaid' || !data.proofUrl) return null
      return build(
        'verification',
        data.validatingAt ?? data.createdAt,
        data.prepayVerificationMinutes ?? 10,
      )
    default:
      return null
  }
}

/**
 * Lo que se puede pintar de un plazo.
 *
 * `deadlineKind` viaja en las dos variantes porque quien pinta necesita saber
 * DE QUÉ reloj se trata para redactar la frase que lo acompaña: «Responden en»,
 * «Pagas en» y «Revisando» son tres sujetos distintos, y un contador sin sujeto
 * es un cronómetro. Antes solo lo sabía la rama de plazo vencido, que ya
 * elegía su texto con `GRACE_LABEL`; el resto de la pantalla tenía que
 * deducirlo del estado del pedido por su cuenta.
 */
export type CountdownView =
  /** Quedan segundos: se pinta `mm:ss`. */
  | {
      kind: 'running'
      deadlineKind: DeadlineKind
      seconds: number
      label: string
      urgent: boolean
      /**
       * Cuánto queda de la ventana, de 1 (recién empezada) a 0 (agotada).
       *
       * Es lo que hace pintable un plazo: un `mm:ss` obliga a leer dos números y
       * a saber de cuánto se partía —«¿7:20 es mucho o poco?» no tiene respuesta
       * sin conocer si la ventana era de ocho minutos o de quince—, mientras que
       * un arco medio vacío se entiende sin leer. Y este flujo tiene tres
       * ventanas de duraciones distintas seguidas, así que la pregunta se hace
       * tres veces.
       *
       * Sale de `totalMs`, que `activeDeadline` ya calculaba y hasta ahora solo
       * se usaba para decidir el umbral del rojo. Se acota a [0, 1]: el reloj
       * del celular puede ir por delante del de la base y dar un `remaining`
       * mayor que la ventana entera, y un arco pintado al 130% se sale del
       * círculo.
       */
      fraction: number
    }
  /**
   * El plazo venció y la base todavía no ha reaccionado. Los crons corren cada
   * minuto, así que hay hasta 60s de desfase — y un `0:00` congelado durante ese
   * minuto parece la app colgada. Se dice qué está pasando en vez de un cero.
   */
  | { kind: 'grace'; deadlineKind: DeadlineKind; label: string }

const GRACE_LABEL: Record<DeadlineKind, string> = {
  acceptance: 'Confirmando…',
  payment: 'Procesando…',
  verification: 'Revisando…',
}

/** Cuándo el contador se pone rojo: el último tercio, con tope de 3 minutos. */
function urgentThresholdMs(totalMs: number): number {
  return Math.min(totalMs / 3, 180_000)
}

export function countdownView(deadline: Deadline, now: number = Date.now()): CountdownView {
  const remaining = deadline.at - now
  if (remaining <= 0)
    return { kind: 'grace', deadlineKind: deadline.kind, label: GRACE_LABEL[deadline.kind] }

  const seconds = Math.ceil(remaining / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return {
    kind: 'running',
    deadlineKind: deadline.kind,
    seconds,
    label: `${m}:${s.toString().padStart(2, '0')}`,
    urgent: remaining <= urgentThresholdMs(deadline.totalMs),
    fraction: deadline.totalMs > 0 ? Math.min(1, Math.max(0, remaining / deadline.totalMs)) : 0,
  }
}
